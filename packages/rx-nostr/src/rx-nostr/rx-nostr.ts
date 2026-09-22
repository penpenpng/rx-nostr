import * as Nostr from "nostr-typedef";
import { defer, identity, map, mergeMap, Observable, Subject, takeUntil } from "rxjs";
import type { EventVerifier } from "../event-verifier/index.ts";
import type { LazyFilter } from "../lazy-filter/index.ts";
import { once, RxDisposableStack } from "../libs/index.ts";
import { RxNostrAlreadyDisposedError, RxNostrCallbackError } from "../libs/error.ts";
import { dropExpiredEvents, verify } from "../operators/index.ts";
import type { ConnectionStatePacket, EventPacket } from "../packets/index.ts";
import type { Publication } from "../publication/index.ts";
import { RxOneshotReq, RxReq } from "../rx-req/index.ts";
import type { RelayInput } from "../types/index.ts";
import { publish, RelayWarmer, reqBackward, reqForward } from "./modules/index.ts";
import { RelayCommunication } from "./relay-communication.ts";
import { RelayPool } from "./relay-pool.ts";
import {
  FilledRxNostrConfig,
  FilledRxNostrPublishOptions,
  FilledRxNostrReqOptions,
} from "./rx-nostr.config.ts";
import type {
  IRxNostr,
  RxNostrConfig,
  RxNostrPublishConfig,
  RxNostrReqConfig,
} from "./rx-nostr.interface.ts";

export class RxNostr implements IRxNostr {
  readonly #stack = new RxDisposableStack();
  readonly #relays: RelayPool<RelayCommunication>;
  readonly #config: FilledRxNostrConfig;
  readonly #warmer: RelayWarmer;
  readonly #dispose$ = new Subject<void>();
  readonly #publications = new Set<ReturnType<typeof publish>>();
  #disposed = false;

  constructor(config: RxNostrConfig) {
    this.#config = new FilledRxNostrConfig(config);
    this.#relays = new RelayPool((url) => {
      if (!this.#config.skipFetchNip11) {
        void this.#config.relayDirectory.fetchNip11(url).catch(() => {});
      }
      return new RelayCommunication(url, {
        WebSocket: this.#config.WebSocket,
        retryer: this.#config.retry,
        relayDirectory: this.#config.relayDirectory,
        authTimeout: this.#config.authTimeout,
      });
    });
    this.#stack.use(this.#relays);

    this.#warmer = new RelayWarmer(this.#relays);
    this.#stack.use(this.#warmer);
  }

  req(
    arg: RxReq | LazyFilter | Iterable<LazyFilter>,
    { relays, ...options }: RxNostrReqConfig,
  ): Observable<EventPacket> {
    const config = new FilledRxNostrReqOptions(options, this.#config);

    const rxReq: RxReq = (() => {
      if (arg instanceof RxReq) {
        return arg;
      } else if (Symbol.iterator in arg) {
        return new RxOneshotReq([...arg]);
      } else {
        return new RxOneshotReq(arg);
      }
    })();

    const req = (() => {
      if (rxReq.strategy === "forward") {
        return reqForward;
      } else {
        return reqBackward;
      }
    })();

    return defer(() => {
      this.#assertActive();
      return req({
        rxReq,
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
    params: Nostr.EventParameters,
    { relays, ...options }: RxNostrPublishConfig,
  ): Publication {
    this.#assertActive();
    const config = new FilledRxNostrPublishOptions(options, this.#config);

    const publication = publish({
      params,
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
              .pipe(map((state) => Object.freeze({ from: relay.url, state }))),
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
    this.#stack.dispose();
  });
  dispose = this[Symbol.dispose];

  #assertActive(): void {
    if (this.#disposed) throw new RxNostrAlreadyDisposedError();
  }
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
