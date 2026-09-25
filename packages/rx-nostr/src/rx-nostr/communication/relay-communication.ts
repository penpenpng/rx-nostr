import type * as Nostr from "nostr-typedef";
import { EMPTY, Observable, catchError, throwError } from "rxjs";
import type { AuthenticatorInput } from "../../authenticator/index.ts";
import type { ConnectionDropDetector } from "../../connection-drop-detector/index.ts";
import type { ConnectionReconnector } from "../../connection-reconnector/index.ts";
import type { RxNostrDiagnostic } from "../../diagnostics/index.ts";
import type { LazyFilter } from "../../lazy-filter/index.ts";
import { once, type RelayUrl } from "../../libs/index.ts";
import type { ConnectionState } from "../../connection-state.ts";
import type { EventPacket, OkPacket } from "../../packets/index.ts";
import type { RelayDirectory } from "../../relay-directory/index.ts";
import type { WebSocketConstructor } from "../../types/index.ts";
import { NostrTransport, NostrTransportOperationError } from "./transport/index.ts";
import { RelayCommunicationError } from "./relay-communication.error.ts";
import type { IRelayCommunication } from "./relay-communication.interface.ts";
import { NostrOperationExecutor, type RelayVreqPlanner } from "./executor/index.ts";
import { RelayReqScheduler } from "./scheduler/index.ts";
import { ConnectionLeaseController } from "./connection-lease.ts";
import { RelayDirectoryBridge } from "./relay-directory-bridge.ts";

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
 * Nostr operation executor, REQ scheduler, and directory bridge.
 */
export class RelayCommunication implements IRelayCommunication {
  readonly #leases: ConnectionLeaseController;
  readonly #executor: NostrOperationExecutor;
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
    this.#executor = new NostrOperationExecutor(url, transport, {
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
        void this.#executor.open().catch(() => {});
      },
      onLastRelease: () => void this.#executor.close().catch(() => {}),
      onDispose: () => this.#executor.dispose(),
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
    return this.#executor
      .vreq(strategy, filters, this.#reqScheduler, options)
      .pipe(catchError((error) => throwError(() => communicationErrorFrom(error))));
  }

  event(
    event: Nostr.Event,
    options: Readonly<{ authenticator?: AuthenticatorInput; timeout?: number }> = {},
  ): Observable<OkPacket> {
    if (this.#leases.count === 0) return EMPTY;
    return this.#executor
      .event(event, options)
      .pipe(catchError((error) => throwError(() => communicationErrorFrom(error))));
  }

  monitorConnectionState(): Observable<ConnectionState> {
    return this.#executor.monitorConnectionState();
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

function communicationErrorFrom(error: unknown): unknown {
  if (error instanceof NostrTransportOperationError) {
    return new RelayCommunicationError(error.reason);
  }
  return error;
}
