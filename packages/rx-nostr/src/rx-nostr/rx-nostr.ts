import { defer, EMPTY, identity, map, mergeMap, Observable, of, Subject, takeUntil } from "rxjs";

import { copySuppressionReasons } from "../connection-state.ts";
import {
  emitDiagnostic,
  getDiagnosticSink,
  setDiagnosticSink,
  type RxNostrDiagnosticSink,
} from "../diagnostics/index.ts";
import type { EventVerifier } from "../event-verifier/index.ts";
import { RxNostrAlreadyDisposedError, RxNostrCallbackError } from "../libs/error.ts";
import { once, RxDisposableStack } from "../libs/index.ts";
import { dropExpiredEvents, verify } from "../operators/index.ts";
import type { ConnectionStatePacket, EventPacket, ReqPacket } from "../packets/index.ts";
import type { Publication, PublishEventParameters } from "../publication/index.ts";
import { RxReq } from "../rx-req/index.ts";
import type { RelayInput } from "../types/index.ts";
import { RelayCommunication, RelayCommunicationCollection } from "./communication/index.ts";
import { ConnectionDemandScope } from "./operation/demand/index.ts";
import {
  FilledRxNostrPublishOptions,
  FilledRxNostrReqOptions,
  publish,
  RelayWarmer,
  reqBackward,
  reqForward,
  type RxNostrPublishConfig,
  type RxNostrReqConfig,
  type RxNostrReqInput,
} from "./operation/index.ts";
import {
  cloneStaticDefaultConfig,
  cloneStaticDefaultOptions,
  FilledRxNostrConfig,
  RX_NOSTR_DEFAULT_CONFIG,
  RX_NOSTR_DEFAULT_OPTIONS,
} from "./rx-nostr.config.ts";
import type {
  IRxNostr,
  RxNostrConfig,
  RxNostrStaticDefaultConfig,
  RxNostrStaticDefaultOptions,
} from "./rx-nostr.interface.ts";

export class RxNostr implements IRxNostr {
  /** Process-wide synchronous log callback for every RxNostr instance. */
  static get logSink(): RxNostrDiagnosticSink | undefined {
    return getDiagnosticSink();
  }

  static set logSink(sink: RxNostrDiagnosticSink | undefined) {
    setDiagnosticSink(sink);
  }

  /** Process-wide constructor defaults snapshotted by each new instance. */
  static defaultConfig: RxNostrStaticDefaultConfig =
    cloneStaticDefaultConfig(RX_NOSTR_DEFAULT_CONFIG);

  /** Process-wide operation defaults snapshotted by each new instance. */
  static defaultOptions: RxNostrStaticDefaultOptions =
    cloneStaticDefaultOptions(RX_NOSTR_DEFAULT_OPTIONS);

  readonly #stack = new RxDisposableStack();
  readonly #relays: RelayCommunicationCollection<RelayCommunication>;
  readonly #config: FilledRxNostrConfig;
  readonly #warmer: RelayWarmer;
  readonly #dispose$ = new Subject<void>();
  readonly #publications = new Set<ReturnType<typeof publish>>();
  readonly #queryDemands = new Set<ConnectionDemandScope>();
  #disposed = false;

  constructor(config: RxNostrConfig = {}) {
    this.#config = new FilledRxNostrConfig(config, RxNostr.defaultConfig, RxNostr.defaultOptions);
    this.#relays = new RelayCommunicationCollection((url) => {
      return new RelayCommunication(url, {
        WebSocket: this.#config.WebSocket,
        authenticator: this.#config.authenticator,
        reconnector: this.#config.reconnector,
        dropDetectors: this.#config.dropDetectors,
        relayDirectory: this.#config.relayDirectory,
        relayHealthPolicy: this.#config.relayHealthPolicy,
        connectionTimeout: this.#config.connectionTimeout,
        ...(this.#config.skipFetchNip11 ? {} : { nip11Timeout: this.#config.nip11Timeout }),
        onDiagnostic: emitDiagnostic,
      });
    });
    this.#stack.use(this.#relays);

    this.#warmer = new RelayWarmer(this.#relays);
    this.#stack.use(this.#warmer);
  }

  forward(
    relays: RelayInput,
    request: RxNostrReqInput,
    options: RxNostrReqConfig = {},
  ): Observable<EventPacket> {
    return this.#req(reqForward, relays, request, options);
  }

  backward(
    relays: RelayInput,
    request: RxNostrReqInput,
    options: RxNostrReqConfig = {},
  ): Observable<EventPacket> {
    return this.#req(reqBackward, relays, request, options);
  }

  #req(
    req: typeof reqForward | typeof reqBackward,
    relays: RelayInput,
    request: RxNostrReqInput,
    options: RxNostrReqConfig,
  ): Observable<EventPacket> {
    const config = new FilledRxNostrReqOptions(options, this.#config);
    const source$: Observable<ReqPacket> =
      request instanceof RxReq
        ? request.asObservable()
        : request.length === 0
          ? EMPTY
          : of({ filters: [...request] });

    return defer(() => {
      this.#assertActive();
      // An empty static request has no demand, even when prewarming is enabled.
      if (source$ === EMPTY) return EMPTY;
      const connectionDemand =
        req === reqBackward
          ? new ConnectionDemandScope(config, () => this.#queryDemands.delete(connectionDemand!))
          : undefined;
      if (connectionDemand) this.#queryDemands.add(connectionDemand);
      return req({
        connectionDemand,
        source$,
        config,
        relayInput: relays,
        relays: this.#relays,
      }).pipe(
        verify(callbackSafeVerifier(config.verifier)),
        config.skipExpirationCheck ? identity : dropExpiredEvents(),
      );
    }).pipe(takeUntil(this.#dispose$));
  }

  publish(
    relays: RelayInput,
    params: PublishEventParameters,
    options: RxNostrPublishConfig = {},
  ): Publication {
    this.#assertActive();
    const config = new FilledRxNostrPublishOptions(options, this.#config);

    const publication = publish({
      params: { ...params, content: params.content ?? "" },
      config,
      relayInput: relays,
      relays: this.#relays,
    });
    this.#publications.add(publication);
    void publication.closed.then(() => this.#publications.delete(publication));
    return publication;
  }

  setHotRelays(relays: RelayInput): void {
    this.#assertActive();
    this.#warmer.setHotRelays(relays);
  }

  unsetHotRelays(): void {
    this.#assertActive();
    this.#warmer.unsetHotRelays();
  }

  monitorConnectionState(): Observable<ConnectionStatePacket> {
    return defer(() => {
      this.#assertActive();
      return this.#relays
        .observeEntries()
        .pipe(
          mergeMap((relay) =>
            relay
              .monitorConnectionState()
              .pipe(map((state) => ({ from: relay.url, state: copyConnectionState(state) }))),
          ),
        );
    });
  }

  [Symbol.dispose] = once(() => {
    this.#disposed = true;
    this.#dispose$.next();
    this.#dispose$.complete();
    for (const publication of this.#publications) publication.cancel();
    this.#publications.clear();
    for (const demand of this.#queryDemands) demand.dispose();
    this.#queryDemands.clear();
    this.#stack.dispose();
  });
  dispose = this[Symbol.dispose];

  #assertActive(): void {
    if (this.#disposed) throw new RxNostrAlreadyDisposedError();
  }
}

function copyConnectionState(
  state: ConnectionStatePacket["state"],
): ConnectionStatePacket["state"] {
  if (state.state === "failed")
    return {
      ...state,
      reason: {
        ...state.reason,
        ...(state.reason.detector ? { detector: { ...state.reason.detector } } : {}),
      },
    };
  if (state.state === "waiting-for-connection") {
    return {
      ...state,
      ...(state.reason === undefined
        ? {}
        : {
            reason: {
              ...state.reason,
              ...(state.reason.detector ? { detector: { ...state.reason.detector } } : {}),
            },
          }),
      ...(state.suppressionReasons
        ? { suppressionReasons: copySuppressionReasons(state.suppressionReasons) }
        : {}),
    };
  }
  return { ...state };
}

function callbackSafeVerifier(verifier: EventVerifier): EventVerifier {
  return {
    async verifyEvent(event) {
      try {
        return await verifier.verifyEvent(event);
      } catch (cause) {
        throw new RxNostrCallbackError("verifier", cause);
      }
    },
  };
}
