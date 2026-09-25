import type * as Nostr from "nostr-typedef";
import { EMPTY, Observable } from "rxjs";
import type { AuthenticatorInput } from "../authenticator/index.ts";
import type { ConnectionDropDetector } from "../connection-drop-detector/index.ts";
import type { ConnectionReconnector } from "../connection-reconnector/index.ts";
import type { RxNostrDiagnostic } from "../diagnostics/index.ts";
import type { LazyFilter } from "../lazy-filter/index.ts";
import { once, type RelayUrl } from "../libs/index.ts";
import type { ConnectionState } from "../connection-state.ts";
import type { EventPacket, OkPacket } from "../packets/index.ts";
import type { RelayDirectory } from "../relay-directory/relay-directory.ts";
import type { WebSocketConstructor } from "../types/index.ts";
import { ConnectionLeaseController } from "./connection-lease.ts";
import { RelayDirectoryBridge } from "./relay-directory-bridge.ts";
import { RelayProtocolSession, type RelayVreqPlanner } from "./relay-protocol-session.ts";
import { RelayReqScheduler } from "./relay-req-scheduler.ts";
import { NostrTransport } from "./transport/index.ts";

export interface IRelayCommunication {
  url: RelayUrl;
  hold(): () => void;
  vreq(
    strategy: "forward" | "backward",
    filters: LazyFilter[],
    options?: Readonly<{
      timeout?: number;
      validateFilterMatching?: boolean;
      authenticator?: AuthenticatorInput;
    }>,
  ): Observable<EventPacket>;
  event(
    event: Nostr.Event,
    options?: Readonly<{ authenticator?: AuthenticatorInput; timeout?: number }>,
  ): Observable<OkPacket>;
}

export interface RelayCommunicationOptions {
  readonly WebSocket?: WebSocketConstructor;
  readonly reconnector?: ConnectionReconnector;
  readonly dropDetectors?: readonly ConnectionDropDetector[];
  readonly relayDirectory?: RelayDirectory;
  readonly onDiagnostic?: (diagnostic: RxNostrDiagnostic) => void;
  readonly nip11Timeout?: number;
  /** @internal Seam for future REQ planning. */
  readonly vreqPlanner?: RelayVreqPlanner;
}

/**
 * Per-relay facade: it owns connection demand and composes the relay-local
 * protocol session, REQ scheduler, and directory bridge.
 */
export class RelayCommunication implements IRelayCommunication {
  readonly #leases: ConnectionLeaseController;
  readonly #protocol: RelayProtocolSession;
  readonly #reqScheduler = new RelayReqScheduler();
  readonly #directory: RelayDirectoryBridge;

  constructor(
    public readonly url: RelayUrl,
    options: RelayCommunicationOptions = {},
  ) {
    this.#directory = new RelayDirectoryBridge(
      url,
      options.relayDirectory,
      (maxSubscriptions) => this.#reqScheduler.setMaxSubscriptions(maxSubscriptions),
      () => this.#reqScheduler.waitForMaxSubscriptions(),
    );
    if (options.nip11Timeout === undefined) this.#directory.useAvailableNip11();
    const transport = new NostrTransport({
      url,
      WebSocket: options.WebSocket,
      reconnector: options.reconnector,
      dropDetectors: options.dropDetectors,
      onDiagnostic: options.onDiagnostic,
      ...this.#directory.transportHooks,
    });
    this.#protocol = new RelayProtocolSession(url, transport, {
      onDiagnostic: options.onDiagnostic,
      vreqPlanner: options.vreqPlanner,
    });
    this.#leases = new ConnectionLeaseController({
      onFirstLease: () => {
        if (options.nip11Timeout !== undefined) {
          void this.#directory.acquireNip11(options.nip11Timeout).catch((cause) => {
            options.onDiagnostic?.({
              severity: "warning",
              occurredAt: Date.now(),
              relay: url,
              message: "Automatic NIP-11 relay information retrieval failed.",
              cause,
            });
          });
        }
        void this.#protocol.open().catch(() => {});
      },
      onLastRelease: () => void this.#protocol.close().catch(() => {}),
      onDispose: () => this.#protocol.dispose(),
    });
  }

  hold(): () => void {
    return this.#leases.hold();
  }

  vreq(
    strategy: "forward" | "backward",
    filters: LazyFilter[],
    options: Readonly<{
      timeout?: number;
      validateFilterMatching?: boolean;
      authenticator?: AuthenticatorInput;
    }> = {},
  ): Observable<EventPacket> {
    if (this.#leases.count === 0) return EMPTY;
    return this.#protocol.vreq(strategy, filters, this.#reqScheduler, options);
  }

  event(
    event: Nostr.Event,
    options: Readonly<{ authenticator?: AuthenticatorInput; timeout?: number }> = {},
  ): Observable<OkPacket> {
    if (this.#leases.count === 0) return EMPTY;
    return this.#protocol.event(event, options);
  }

  monitorConnectionState(): Observable<ConnectionState> {
    return this.#protocol.monitorConnectionState();
  }

  /** @internal */
  get leaseCount(): number {
    return this.#leases.count;
  }

  [Symbol.dispose] = once(() => {
    this.#reqScheduler.dispose();
    this.#directory.dispose();
    this.#leases.dispose();
  });
  dispose = this[Symbol.dispose];
}
