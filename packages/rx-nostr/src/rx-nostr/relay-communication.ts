import type * as Nostr from "nostr-typedef";
import { EMPTY, Observable, type Subscriber, type Subscription, filter, map } from "rxjs";
import type { AuthenticatorInput } from "../authenticator/index.ts";
import type { ConnectionRetryer } from "../connection-retryer/index.ts";
import { evalFilters, type LazyFilter } from "../lazy-filter/index.ts";
import { isFiltered, once, type RelayUrl } from "../libs/index.ts";
import { RxNostrCallbackError } from "../libs/error.ts";
import {
  getRelayDirectoryReporter,
  type RelayDirectory,
} from "../relay-directory/relay-directory.ts";
import type { ConnectionState } from "../connection-state.ts";
import type { EventMessagePacket, EventPacket, OkPacket } from "../packets/index.ts";
import type { WebSocketConstructor } from "../types/index.ts";
import { AuthenticationFailure, AuthCoordinator } from "./auth-coordinator.ts";
import { ConnectionLeaseController } from "./connection-lease.ts";
import { NostrTransport, NostrTransportOperationError } from "./transport/index.ts";

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
    options?: Readonly<{
      authenticator?: AuthenticatorInput;
      timeout?: number;
    }>,
  ): Observable<OkPacket>;
}

export interface RelayCommunicationOptions {
  readonly WebSocket?: WebSocketConstructor;
  readonly retryer?: ConnectionRetryer;
  readonly relayDirectory?: RelayDirectory;
}

// 将来、接続を多重化することがあればこのレイヤーで実装する
export class RelayCommunication implements IRelayCommunication {
  readonly #transport: NostrTransport;
  readonly #leases: ConnectionLeaseController;
  readonly #auth: AuthCoordinator;
  readonly #directorySubscription?: Subscription;
  readonly #pendingQueries: QueryTask[] = [];
  readonly #activeQueries = new Set<QueryTask>();
  #maxSubscriptions?: number;
  #nextSubId = 0;
  #disposed = false;

  constructor(
    public readonly url: RelayUrl,
    options: RelayCommunicationOptions = {},
  ) {
    const relayDirectory = options.relayDirectory;
    const directoryReporter = relayDirectory
      ? getRelayDirectoryReporter(relayDirectory)
      : undefined;
    this.#transport = new NostrTransport({
      url,
      WebSocket: options.WebSocket,
      retryer: options.retryer,
      onConnectionOpened: directoryReporter
        ? () => directoryReporter.connectionOpened(url)
        : undefined,
      onConnectionFailed: directoryReporter
        ? () => directoryReporter.connectionFailed(url)
        : undefined,
      getConnectionHealth: relayDirectory
        ? () => {
            const entry = relayDirectory.getOrCreate(url);
            return Object.freeze({
              consecutiveFailures: entry.consecutiveFailures,
              ...(entry.lastConnectedAt === undefined
                ? {}
                : { lastConnectedAt: entry.lastConnectedAt }),
              ...(entry.lastFailureAt === undefined ? {} : { lastFailureAt: entry.lastFailureAt }),
            });
          }
        : undefined,
    });
    this.#leases = new ConnectionLeaseController({
      onFirstLease: () => void this.#transport.open().catch(() => {}),
      onLastRelease: () => void this.#transport.close().catch(() => {}),
      onDispose: () => void this.#transport.dispose().catch(() => {}),
    });
    this.#auth = new AuthCoordinator(url, this.#transport);
    if (relayDirectory) {
      this.#directorySubscription = relayDirectory.observe(url).subscribe({
        next: (entry) => {
          this.#maxSubscriptions = entry.maxSubscriptions;
          this.#drainQueries();
        },
        complete: () => {
          this.#maxSubscriptions = undefined;
          this.#drainQueries();
        },
      });
    }
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

    const subId = `rx-nostr:${this.#nextSubId++}`;
    return this.#scheduleQuery(() => {
      let evaluatedFilters: Nostr.Filter[] = [];
      let queryEvaluated = false;
      return new Observable<EventPacket>((subscriber) => {
        let stopped = false;
        let remoteTerminated = false;
        let authRetried = false;
        const authAbort = new AbortController();
        let subscription: Subscription | undefined;
        const start = () => {
          let terminalAuthRequired = false;
          remoteTerminated = false;
          const packets = this.#transport.subscribe({
            query: () => {
              try {
                evaluatedFilters = evalFilters(filters);
              } catch (cause) {
                throw new RxNostrCallbackError("filter", cause);
              }
              queryEvaluated = true;
              return ["REQ", subId, ...evaluatedFilters];
            },
            selector: (packet) => packet.type === "EVENT" && packet.subId === subId,
            terminator: (packet) => {
              const terminal =
                (packet.type === "CLOSED" && packet.subId === subId) ||
                (strategy === "backward" && packet.type === "EOSE" && packet.subId === subId);
              terminalAuthRequired =
                terminal && packet.type === "CLOSED" && packet.noticeType === "auth-required";
              return terminal;
            },
            ...(strategy === "backward" &&
            options.timeout !== undefined &&
            Number.isFinite(options.timeout)
              ? {
                  timeout: options.timeout === 0 ? Number.MIN_VALUE : options.timeout,
                }
              : {}),
            retry: "resend",
          });
          subscription = packets
            .pipe(
              filter((packet): packet is EventMessagePacket => packet.type === "EVENT"),
              filter(
                (packet) =>
                  options.validateFilterMatching !== true ||
                  isFiltered(packet.event, evaluatedFilters),
              ),
              map((packet) => ({
                from: packet.from,
                type: "EVENT" as const,
                event: packet.event,
              })),
            )
            .subscribe({
              next: (packet) => subscriber.next(packet),
              complete: () => {
                remoteTerminated = true;
                if (terminalAuthRequired && !authRetried) {
                  authRetried = true;
                  void this.#auth.authenticate(options.authenticator, authAbort.signal).then(
                    () => {
                      if (!stopped && !subscriber.closed) start();
                    },
                    (error) => finishAfterAuthentication(error, subscriber),
                  );
                } else {
                  subscriber.complete();
                }
              },
              error: (error) => {
                const callbackError = callbackErrorFrom(error);
                if (callbackError) subscriber.error(callbackError);
                else subscriber.complete();
              },
            });
        };
        start();

        return () => {
          stopped = true;
          authAbort.abort();
          if (!remoteTerminated && queryEvaluated) {
            void this.#transport.cast(["CLOSE", subId]).catch(() => {});
          }
          subscription?.unsubscribe();
        };
      });
    });
  }

  event(
    event: Nostr.Event,
    options: Readonly<{
      authenticator?: AuthenticatorInput;
      timeout?: number;
    }> = {},
  ): Observable<OkPacket> {
    if (this.#leases.count === 0) return EMPTY;

    return new Observable((subscriber) => {
      let stopped = false;
      let authRetried = false;
      const authAbort = new AbortController();
      let subscription: Subscription | undefined;
      const start = () => {
        subscription = this.#transport
          .subscribe({
            query: ["EVENT", event],
            selector: (packet) => packet.type === "OK" && packet.eventId === event.id,
            ...(options.timeout !== undefined && Number.isFinite(options.timeout)
              ? {
                  timeout: options.timeout === 0 ? Number.MIN_VALUE : options.timeout,
                }
              : {}),
            retry: "resend",
          })
          .pipe(filter((packet): packet is OkPacket => packet.type === "OK"))
          .subscribe({
            next: (packet) => {
              const authRequired = !packet.ok && packet.noticeType === "auth-required";
              subscriber.next(packet);
              subscription?.unsubscribe();
              if (authRequired && !authRetried) {
                authRetried = true;
                void this.#auth.authenticate(options.authenticator, authAbort.signal).then(
                  () => {
                    if (!stopped && !subscriber.closed) start();
                  },
                  (error) => finishAfterAuthentication(error, subscriber),
                );
              } else {
                subscriber.complete();
              }
            },
            error: (error) => subscriber.error(error),
          });
      };
      start();
      return () => {
        stopped = true;
        authAbort.abort();
        subscription?.unsubscribe();
      };
    });
  }

  monitorConnectionState(): Observable<ConnectionState> {
    return this.#transport.state$.asObservable();
  }

  /** @internal */
  get leaseCount(): number {
    return this.#leases.count;
  }

  #scheduleQuery(create: () => Observable<EventPacket>): Observable<EventPacket> {
    return new Observable((subscriber) => {
      if (this.#disposed) {
        subscriber.complete();
        return;
      }
      const task: QueryTask = {
        subscriber,
        create,
        started: false,
        finished: false,
      };
      this.#pendingQueries.push(task);
      this.#drainQueries();
      return () => this.#finishQuery(task);
    });
  }

  #drainQueries(): void {
    if (this.#disposed) return;
    const limit = this.#maxSubscriptions ?? Number.POSITIVE_INFINITY;
    if (limit === 0) {
      const unavailable = this.#pendingQueries.splice(0);
      for (const task of unavailable) task.subscriber.complete();
      return;
    }
    while (this.#pendingQueries.length > 0 && this.#activeQueries.size < limit) {
      const task = this.#pendingQueries.shift()!;
      if (task.finished) continue;
      task.started = true;
      this.#activeQueries.add(task);
      task.subscription = task.create().subscribe(task.subscriber);
      task.subscription.add(() => this.#finishQuery(task));
    }
  }

  #finishQuery(task: QueryTask): void {
    if (task.finished) return;
    task.finished = true;
    if (task.started) {
      this.#activeQueries.delete(task);
      task.subscription?.unsubscribe();
    } else {
      const index = this.#pendingQueries.indexOf(task);
      if (index >= 0) this.#pendingQueries.splice(index, 1);
    }
    this.#drainQueries();
  }

  [Symbol.dispose] = once(() => {
    this.#disposed = true;
    this.#auth.dispose();
    this.#directorySubscription?.unsubscribe();
    for (const task of [...this.#pendingQueries]) task.subscriber.complete();
    for (const task of [...this.#activeQueries]) task.subscriber.complete();
    this.#pendingQueries.length = 0;
    this.#activeQueries.clear();
    this.#leases.dispose();
  });
  dispose = this[Symbol.dispose];
}

interface QueryTask {
  readonly subscriber: Subscriber<EventPacket>;
  readonly create: () => Observable<EventPacket>;
  started: boolean;
  finished: boolean;
  subscription?: Subscription;
}

function callbackErrorFrom(error: unknown): RxNostrCallbackError | undefined {
  if (error instanceof RxNostrCallbackError) return error;
  if (
    error instanceof NostrTransportOperationError &&
    error.cause instanceof RxNostrCallbackError
  ) {
    return error.cause;
  }
  return undefined;
}

function finishAfterAuthentication(error: unknown, subscriber: Subscriber<unknown>): void {
  if (subscriber.closed) return;
  if (error instanceof RxNostrCallbackError) subscriber.error(error);
  else if (error instanceof AuthenticationFailure) subscriber.complete();
  else subscriber.complete();
}
