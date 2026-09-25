import type * as Nostr from "nostr-typedef";
import { Observable, type Subscription, filter, map, merge } from "rxjs";
import type { AuthenticatorInput } from "../authenticator/index.ts";
import type { RxNostrDiagnostic } from "../diagnostics/index.ts";
import { evalFilters, type LazyFilter } from "../lazy-filter/index.ts";
import { isFiltered, once, type RelayUrl } from "../libs/index.ts";
import { RxNostrCallbackError } from "../libs/error.ts";
import type { ConnectionState } from "../connection-state.ts";
import type { EventMessagePacket, EventPacket, OkPacket } from "../packets/index.ts";
import { AuthenticationFailure, AuthCoordinator } from "./auth-coordinator.ts";
import type { ReqScheduler } from "./relay-req-scheduler.ts";
import { NostrTransport, NostrTransportOperationError } from "./transport/index.ts";

/** Owns relay-local Nostr protocol operations over one transport session. */
export class RelayProtocolSession implements Disposable {
  readonly #auth: AuthCoordinator;
  readonly #vreqPlanner: RelayVreqPlanner;
  #nextSubId = 0;

  constructor(
    readonly url: RelayUrl,
    readonly transport: NostrTransport,
    private readonly options: RelayProtocolSessionOptions = {},
  ) {
    this.#auth = new AuthCoordinator(url, transport);
    this.#vreqPlanner = options.vreqPlanner ?? defaultVreqPlanner;
  }

  open(): Promise<void> {
    return this.transport.open();
  }

  close(): Promise<void> {
    return this.transport.close();
  }

  monitorConnectionState(): Observable<ConnectionState> {
    return this.transport.state$.asObservable();
  }

  vreq(
    strategy: "forward" | "backward",
    filters: LazyFilter[],
    reqScheduler: ReqScheduler,
    options: Readonly<{
      timeout?: number;
      validateFilterMatching?: boolean;
      authenticator?: AuthenticatorInput;
    }> = {},
  ): Observable<EventPacket> {
    const reqPlans = this.#planVreq(strategy, filters);
    return merge(...reqPlans.map((plan) => this.#executeReqPlan(plan, reqScheduler, options)));
  }

  #planVreq(strategy: "forward" | "backward", filters: LazyFilter[]): ReqPlan[] {
    return this.#vreqPlanner(strategy, filters);
  }

  #executeReqPlan(
    plan: ReqPlan,
    scheduler: ReqScheduler,
    options: Readonly<{
      timeout?: number;
      validateFilterMatching?: boolean;
      authenticator?: AuthenticatorInput;
    }>,
  ): Observable<EventPacket> {
    return new Observable((subscriber) => {
      let stopped = false;
      let authRetried = false;
      const authAbort = new AbortController();
      let reqSubscription: Subscription | undefined;

      const startReq = () => {
        const subId = `rx-nostr:${this.#nextSubId++}`;
        let terminalAuthRequired = false;
        reqSubscription = scheduler
          .schedule(() =>
            this.#req(plan, subId, options, (authRequired) => {
              terminalAuthRequired = authRequired;
            }),
          )
          .subscribe({
            next: (packet) => subscriber.next(packet),
            complete: () => {
              if (terminalAuthRequired && !authRetried) {
                authRetried = true;
                void this.#auth.authenticate(options.authenticator, authAbort.signal).then(
                  () => {
                    if (!stopped && !subscriber.closed) startReq();
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

      startReq();
      return () => {
        stopped = true;
        authAbort.abort();
        reqSubscription?.unsubscribe();
      };
    });
  }

  #req(
    plan: ReqPlan,
    subId: string,
    options: Readonly<{
      timeout?: number;
      validateFilterMatching?: boolean;
      authenticator?: AuthenticatorInput;
    }>,
    onRemoteTerminated: (authRequired: boolean) => void,
  ): Observable<EventPacket> {
    return new Observable<EventPacket>((subscriber) => {
      let evaluatedFilters: Nostr.Filter[] = [];
      let queryEvaluated = false;
      let remoteTerminated = false;
      let subscription: Subscription | undefined;
      let terminalAuthRequired = false;
      const packets = this.transport.subscribe({
        query: () => {
          try {
            evaluatedFilters = evalFilters(plan.filters);
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
            (plan.strategy === "backward" && packet.type === "EOSE" && packet.subId === subId);
          terminalAuthRequired =
            terminal && packet.type === "CLOSED" && packet.noticeType === "auth-required";
          return terminal;
        },
        ...(plan.strategy === "backward" &&
        options.timeout !== undefined &&
        Number.isFinite(options.timeout)
          ? { timeout: options.timeout === 0 ? Number.MIN_VALUE : options.timeout }
          : {}),
        retry: "resend",
      });
      subscription = packets
        .pipe(
          filter((packet): packet is EventMessagePacket => packet.type === "EVENT"),
          filter(
            (packet) =>
              options.validateFilterMatching !== true || isFiltered(packet.event, evaluatedFilters),
          ),
          map((packet) => ({ from: packet.from, type: "EVENT" as const, event: packet.event })),
        )
        .subscribe({
          next: (packet) => subscriber.next(packet),
          complete: () => {
            remoteTerminated = true;
            onRemoteTerminated(terminalAuthRequired);
            subscriber.complete();
          },
          error: (error) => subscriber.error(error),
        });

      return () => {
        if (!remoteTerminated && queryEvaluated) {
          void this.transport.cast(["CLOSE", subId]).catch((cause) => {
            this.options.onDiagnostic?.({
              severity: "warning",
              occurredAt: Date.now(),
              relay: this.url,
              message: "A best-effort CLOSE message could not be sent to the relay.",
              cause,
            });
          });
        }
        subscription?.unsubscribe();
      };
    });
  }

  event(
    event: Nostr.Event,
    options: Readonly<{ authenticator?: AuthenticatorInput; timeout?: number }> = {},
  ): Observable<OkPacket> {
    return new Observable((subscriber) => {
      let stopped = false;
      let authRetried = false;
      const authAbort = new AbortController();
      let subscription: Subscription | undefined;
      const start = () => {
        subscription = this.transport
          .subscribe({
            query: ["EVENT", event],
            selector: (packet) => packet.type === "OK" && packet.eventId === event.id,
            ...(options.timeout !== undefined && Number.isFinite(options.timeout)
              ? { timeout: options.timeout === 0 ? Number.MIN_VALUE : options.timeout }
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

  [Symbol.dispose] = once(() => {
    this.#auth.dispose();
    void this.transport.dispose().catch(() => {});
  });
  dispose = this[Symbol.dispose];
}

export interface ReqPlan {
  readonly strategy: "forward" | "backward";
  readonly filters: LazyFilter[];
}

export type RelayVreqPlanner = (
  strategy: "forward" | "backward",
  filters: LazyFilter[],
) => ReqPlan[];

export interface RelayProtocolSessionOptions {
  readonly onDiagnostic?: (diagnostic: RxNostrDiagnostic) => void;
  readonly vreqPlanner?: RelayVreqPlanner;
}

const defaultVreqPlanner: RelayVreqPlanner = (strategy, filters) => [{ strategy, filters }];

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

function finishAfterAuthentication(
  error: unknown,
  subscriber: import("rxjs").Subscriber<unknown>,
): void {
  if (subscriber.closed) return;
  if (error instanceof RxNostrCallbackError) subscriber.error(error);
  else if (error instanceof AuthenticationFailure) subscriber.complete();
  else subscriber.complete();
}
