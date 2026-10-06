import type * as Nostr from "nostr-typedef";
import { BehaviorSubject, Observable, Subject, type Subscription } from "rxjs";
import {
  Unipls,
  type ConnectionAttemptSnapshot,
  type StreamFinalization,
  type SubscriptionHandle,
  type UniplsDrop,
  type UniplsDropRetryStrategy,
  type UniplsLifecycleSnapshot,
  type UniplsLog,
  type UniplsRetryStrategy,
  type WebSocketConstructor as UniplsWebSocketConstructor,
} from "unipls";
import type { UniplsDropDetector } from "unipls/drop-detectors";
import type { ReconnectionContext, UniplsReconnector } from "unipls/reconnectors";

import type {
  ConnectionDropDetector,
  ConnectionDropDetectorContext,
} from "../../../connection-drop-detector/index.ts";
import type {
  RelayHealthPolicyInput,
  ConnectionReconnectorContext,
  ConnectionReconnector,
} from "../../../connection-reconnector/index.ts";
import { type ConnectionFailure, type ConnectionState } from "../../../connection-state.ts";
import type { RxNostrDiagnostic } from "../../../diagnostics/index.ts";
import type { RelayUrl } from "../../../libs/relay-urls.ts";
import type { MessagePacket } from "../../../packets/index.ts";
import type { WebSocketConstructor } from "../../../types/index.ts";
import { ConnectionAttemptCoordinator } from "./connection-attempt-coordinator.ts";
import { decodeRelayMessage, serializeNostrMessage } from "./nostr-codec.ts";

export type NostrTransportState = ConnectionState;

export type NostrTransportDiagnostic = RxNostrDiagnostic;

export type NostrTransportOperationErrorReason =
  | "aborted"
  | "timeout"
  | "open-error"
  | "dropped"
  | "buffer-overflow"
  | "callback-error"
  | "fatal-error";

export class NostrTransportOperationError extends Error {
  override readonly name = "NostrTransportOperationError";

  constructor(
    public readonly reason: NostrTransportOperationErrorReason,
    options?: ErrorOptions,
  ) {
    super(`The relay operation ended with ${reason}.`, options);
  }
}

export interface NostrTransportOptions {
  readonly url: RelayUrl;
  readonly WebSocket?: WebSocketConstructor;
  readonly timeout?: number;
  readonly reconnector?: ConnectionReconnector;
  readonly dropDetectors?: readonly ConnectionDropDetector[];
  readonly onDiagnostic?: (diagnostic: RxNostrDiagnostic) => void;
  readonly onConnectionOpened?: () => () => void;
  readonly onConnectionFailed?: () => void;
  readonly retainConnectionHealth?: () => () => void;
  readonly relayHealthPolicy?: RelayHealthPolicyInput;
  readonly acquireConnectionProbe?: () => (() => void) | undefined;
  readonly observeConnectionHealth?: (listener: () => void) => () => void;
  readonly getConnectionHealth?: () => ConnectionReconnectorContext["health"];
}

export interface NostrTransportListenOptions {
  readonly selector?: (packet: MessagePacket) => boolean;
  readonly terminator?: (packet: MessagePacket) => boolean;
  readonly timeout?: number;
  readonly retry?: UniplsDropRetryStrategy;
}

export interface NostrTransportSubscribeOptions {
  readonly query: Nostr.ToRelayMessage.Any | (() => Nostr.ToRelayMessage.Any);
  readonly selector: (packet: MessagePacket) => boolean;
  readonly terminator?: (packet: MessagePacket) => boolean;
  readonly timeout?: number;
  readonly signal?: AbortSignal;
  readonly retry?: UniplsRetryStrategy<Nostr.ToRelayMessage.Any, MessagePacket>;
}

/**
 * The only bridge between rx-nostr's Nostr domain and unipls.
 *
 * This class is internal: none of its unipls-backed types are exported from
 * rx-nostr's package entry point.
 */
export class NostrTransport {
  beforeSend?: (signal: AbortSignal) => Promise<void> | undefined;
  readonly messages$ = new Subject<MessagePacket>();
  readonly state$ = new BehaviorSubject<NostrTransportState>(Object.freeze({ state: "dormant" }));

  readonly #client: Unipls<Nostr.ToRelayMessage.Any, MessagePacket>;
  readonly #removeListeners: Array<() => void> = [];
  #closeDirectoryConnection?: () => void;
  #disposePromise?: Promise<void>;
  #hasBeenReady = false;
  readonly #attemptCoordinator: ConnectionAttemptCoordinator;
  #releaseHealth?: () => void;
  #admissionController?: AbortController;
  #pendingOpen?: { controller: AbortController; promise: Promise<void> };

  constructor(readonly options: NostrTransportOptions) {
    this.#attemptCoordinator = new ConnectionAttemptCoordinator(options, (state) =>
      this.#emitState(state),
    );

    const dropDetectors =
      options.dropDetectors?.map((detector) => createUniplsDropDetector(options.url, detector)) ??
      [];

    this.#client = new Unipls({
      url: options.url,
      serializer: serializeNostrMessage,
      deserializer: (data) => decodeRelayMessage(data, options.url),
      WebSocket: options.WebSocket as UniplsWebSocketConstructor | undefined,
      timeout: options.timeout ?? 30_000,
      reconnector: options.reconnector
        ? createUniplsReconnector(
            options.url,
            options.reconnector,
            (state) => this.#emitState(state),
            options.getConnectionHealth,
            this.#attemptCoordinator,
            (cause) =>
              this.#emitDiagnostic({
                level: "error",
                event: "connection/policy-failed",
                message: "Connection recovery policy failed.",
                cause,
              }),
          )
        : undefined,
      dropDetectors,
      logSink: (log) => this.#onUniplsLog(log),
    });

    this.#removeListeners.push(
      this.#client.on("message", ({ message }) => this.messages$.next(message)),
      this.#client.on("lifecycle", ({ previous, current }) => this.#onLifecycle(previous, current)),
      this.#client.on("dropped", ({ drop }) => this.#emitDiagnostic(diagnosticFromDrop(drop))),
    );
  }

  open(): Promise<void> {
    if (this.#pendingOpen) {
      return this.#pendingOpen.promise;
    }
    if (this.#disposePromise) {
      return Promise.reject(new NostrTransportOperationError("aborted"));
    }
    if (this.state$.value.state === "connected") {
      return this.#client.open();
    }

    this.#releaseHealth ??= this.options.retainConnectionHealth?.();

    const controller = new AbortController();

    this.#admissionController = controller;

    let prepared: ReturnType<ConnectionAttemptCoordinator["prepare"]>;
    const failed = (error: unknown): void => {
      if (this.#admissionController !== controller || controller.signal.aborted) {
        return;
      }

      this.#admissionController = undefined;

      this.#attemptCoordinator.releaseProbe();
      this.#releaseHealth?.();

      this.#releaseHealth = undefined;

      if (!controller.signal.aborted) {
        this.#emitDiagnostic({
          level: "error",
          event: "connection/policy-failed",
          message: "Connection admission failed.",
          cause: error,
        });
        this.#emitState(
          Object.freeze({
            state: "failed",
            attempt: 0,
            reason: failureFromCause("policy-error", error),
          }),
        );
      }
    };

    try {
      prepared = this.#attemptCoordinator.prepare(controller.signal, 0);
    } catch (error) {
      failed(error);

      return Promise.reject(error);
    }

    if (!("then" in prepared)) {
      this.#admissionController = undefined;

      if (controller.signal.aborted || prepared.action !== "retry") {
        return Promise.reject(new NostrTransportOperationError("aborted"));
      }

      return this.#client.open();
    }

    const pending = {
      controller,
      promise: prepared
        .catch((error) => {
          failed(error);
          throw error;
        })
        .then((decision) => {
          if (controller.signal.aborted || decision.action !== "retry") {
            throw new NostrTransportOperationError("aborted");
          }

          return this.#client.open();
        })
        .finally(() => {
          if (this.#pendingOpen === pending) {
            this.#pendingOpen = undefined;
          }
          if (this.#admissionController === controller) {
            this.#admissionController = undefined;
          }
        }),
    };

    if (!controller.signal.aborted) {
      this.#pendingOpen = pending;
    }

    return pending.promise;
  }

  close(): Promise<void> {
    this.#admissionController?.abort();

    this.#admissionController = undefined;

    this.#pendingOpen?.controller.abort();

    this.#pendingOpen = undefined;

    this.#attemptCoordinator.releaseProbe();

    if (this.state$.value.state === "waiting-for-connection") {
      this.#emitState(Object.freeze({ state: "dormant" }));
    }

    const releaseHealth = this.#releaseHealth;

    this.#releaseHealth = undefined;

    return this.#client.close().finally(() => releaseHealth?.());
  }

  cast(
    query: Nostr.ToRelayMessage.Any,
    options: { readonly timeout?: number; readonly signal?: AbortSignal } = {},
  ): Promise<void> {
    try {
      return this.#client.cast({ query, ...options });
    } catch (error) {
      return Promise.reject(error);
    }
  }

  /** Send an ordinary operation after the connection's AUTH barrier clears. */
  async castAfterAuth(
    query: Nostr.ToRelayMessage.Any,
    options: { readonly timeout?: number; readonly signal?: AbortSignal } = {},
  ): Promise<void> {
    if (options.signal?.aborted) {
      throw new NostrTransportOperationError("aborted");
    }

    const controller = new AbortController();
    const abort = () => controller.abort();

    options.signal?.addEventListener("abort", abort, { once: true });

    if (options.signal?.aborted) {
      abort();
    }

    const signal = controller.signal;
    let timedOut = false;
    const timer =
      options.timeout !== undefined && Number.isFinite(options.timeout)
        ? setTimeout(
            () => {
              timedOut = true;

              controller.abort();
            },
            Math.max(0, options.timeout),
          )
        : undefined;

    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        let stateSubscription: Subscription | undefined;
        const finish = (error?: unknown) => {
          if (settled) {
            return;
          }

          settled = true;

          stateSubscription?.unsubscribe();
          signal.removeEventListener("abort", onAbort);

          if (error === undefined) {
            resolve();
          } else {
            reject(error);
          }
        };
        const onAbort = () =>
          finish(new NostrTransportOperationError(timedOut ? "timeout" : "aborted"));

        signal.addEventListener("abort", onAbort, { once: true });

        stateSubscription = this.state$.subscribe((state) => {
          if (state.state === "connected") {
            finish();
          } else if (state.state === "failed") {
            finish(new NostrTransportOperationError("open-error", { cause: state.reason }));
          } else if (state.state === "disposed") {
            finish(new NostrTransportOperationError("aborted"));
          }
        });

        if (settled) {
          stateSubscription.unsubscribe();
        }
        if (signal.aborted) {
          onAbort();
        }
      });

      // Connection listeners install NIP-42 challenges in the same microtask.
      await Promise.resolve();
      let barrier = this.beforeSend?.(signal);

      while (barrier) {
        await barrier;

        if (signal.aborted) {
          throw new NostrTransportOperationError(timedOut ? "timeout" : "aborted");
        }

        barrier = this.beforeSend?.(signal);
      }

      if (signal.aborted) {
        throw new NostrTransportOperationError(timedOut ? "timeout" : "aborted");
      }

      try {
        await this.cast(query, { timeout: options.timeout, signal });
      } catch (error) {
        if (timedOut) {
          throw new NostrTransportOperationError("timeout", { cause: error });
        }

        throw error;
      }
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }

      options.signal?.removeEventListener("abort", abort);
    }
  }

  listen(options: NostrTransportListenOptions = {}): Observable<MessagePacket> {
    return createStreamObservable(
      (onMatch) => this.#client.listen({ ...options, onMatch }),
      (finalization) => this.#emitStreamFailureDiagnostic(finalization),
    );
  }

  subscribe(options: NostrTransportSubscribeOptions): Observable<MessagePacket> {
    // AUTH remains a direct transport operation. Ordinary operations own their
    // resend here so that recovery cannot bypass the authentication barrier.
    const raw = (retry = options.retry) =>
      createStreamObservable(
        (onMatch) => this.#client.subscribe({ ...options, retry, onMatch }),
        (finalization) => this.#emitStreamFailureDiagnostic(finalization),
      );

    if (!this.beforeSend || (typeof options.query !== "function" && options.query[0] === "AUTH")) {
      return raw();
    }

    return new Observable((subscriber) => {
      const controller = new AbortController();
      let active: Subscription | undefined;
      let starting = false;
      let waiting = true;
      const abort = () => {
        controller.abort();
        subscriber.error(new NostrTransportOperationError("aborted"));
      };

      options.signal?.addEventListener("abort", abort, { once: true });
      const start = async () => {
        if (starting || !waiting || subscriber.closed || this.state$.value.state !== "connected") {
          return;
        }

        starting = true;

        try {
          // Yield once so connection lifecycle listeners can install a challenge.
          await Promise.resolve();
          let barrier = this.beforeSend!(controller.signal);

          while (barrier) {
            await barrier;

            barrier = this.beforeSend!(controller.signal);
          }

          if (
            subscriber.closed ||
            controller.signal.aborted ||
            this.state$.value.state !== "connected"
          ) {
            return;
          }

          waiting = false;
          active = raw("fail").subscribe({
            next: (packet) => subscriber.next(packet),
            complete: () => subscriber.complete(),
            error: (error) => {
              if (
                error instanceof NostrTransportOperationError &&
                error.reason === "dropped" &&
                options.retry === "resend" &&
                this.options.reconnector
              ) {
                waiting = true;

                queueMicrotask(() => void start());
              } else {
                subscriber.error(error);
              }
            },
          });
        } catch (error) {
          if (!subscriber.closed) {
            subscriber.error(error);
          }
        } finally {
          starting = false;

          if (waiting && this.state$.value.state === "connected" && !subscriber.closed) {
            queueMicrotask(() => void start());
          }
        }
      };
      const stateSubscription = this.state$.subscribe((state) => {
        if (state.state === "connected") {
          void start();
        } else if (state.state === "failed" && waiting) {
          subscriber.error(new NostrTransportOperationError("open-error", { cause: state.reason }));
        } else if (state.state === "disposed" || (state.state === "dormant" && waiting)) {
          subscriber.complete();
        }
      });

      if (options.signal?.aborted) {
        abort();
      }

      return () => {
        controller.abort();
        options.signal?.removeEventListener("abort", abort);
        active?.unsubscribe();
        stateSubscription.unsubscribe();
      };
    });
  }

  dispose(): Promise<void> {
    if (this.#disposePromise) {
      return this.#disposePromise;
    }

    this.#disposePromise = (async () => {
      await this.close();

      for (const remove of this.#removeListeners.splice(0)) {
        remove();
      }

      this.#closeDirectoryConnection?.();

      this.#closeDirectoryConnection = undefined;

      this.#emitState(Object.freeze({ state: "disposed" }));
      this.messages$.complete();
      this.state$.complete();
    })();

    return this.#disposePromise;
  }

  #onLifecycle(previous: UniplsLifecycleSnapshot, current: UniplsLifecycleSnapshot): void {
    if (current.phase === "open") {
      this.#hasBeenReady = true;
    }

    const attempt = failedAttemptFromTransition(previous, current);

    if (attempt) {
      const drop = attempt.drop ?? dropFromCause(attempt.cause);

      if (this.#hasBeenReady && drop && attempt.origin === "initial") {
        this.#emitDiagnostic(diagnosticFromDrop(drop));
      } else {
        this.#emitDiagnostic({
          level: "warning",
          event: "connection/attempt-failed",
          message: "A relay connection attempt failed.",
          cause: attempt.cause,
          context: {
            relay: this.options.url,
            attempt: attempt.attempt,
            origin: attempt.origin,
            ...(drop ? dropContext(drop) : {}),
          },
        });
      }
    }

    this.#reportHealth(previous, current);

    if (
      current.phase === "open" ||
      current.phase === "closed" ||
      attemptFailed(previous, current)
    ) {
      this.#attemptCoordinator.releaseProbe();
    }
    if (current.phase === "closed") {
      this.#releaseHealth?.();

      this.#releaseHealth = undefined;
    }

    const state = stateFromLifecycle(current);

    if (state) {
      this.#emitState(state);
    }
  }

  #reportHealth(previous: UniplsLifecycleSnapshot, current: UniplsLifecycleSnapshot): void {
    if (current.phase === "open") {
      this.#closeDirectoryConnection?.();

      this.#closeDirectoryConnection = this.options.onConnectionOpened?.();

      return;
    }
    if (previous.phase === "open") {
      this.#closeDirectoryConnection?.();

      this.#closeDirectoryConnection = undefined;

      if (
        !("drop" in current && ignoresRelayHealth(current.drop)) &&
        (current.phase !== "closed" || current.reason !== "user")
      ) {
        this.options.onConnectionFailed?.();
      }

      return;
    }
    if (
      attemptFailed(previous, current) &&
      !ignoresRelayHealth(failedAttemptFromTransition(previous, current)?.drop)
    ) {
      this.options.onConnectionFailed?.();
    }
  }

  #emitState(state: NostrTransportState): void {
    if (!sameConnectionState(this.state$.value, state)) {
      this.state$.next(state);
    }
  }

  #emitDiagnostic(diagnostic: RxNostrDiagnostic): void {
    const withRelay: RxNostrDiagnostic = Object.freeze({
      ...diagnostic,
      context: Object.freeze({
        ...diagnostic.context,
        relay: diagnostic.context?.relay ?? this.options.url,
      }),
    });

    this.options.onDiagnostic?.(withRelay);
  }

  #emitStreamFailureDiagnostic(
    finalization: Extract<StreamFinalization<MessagePacket>, { ok: false }>,
  ): void {
    if (finalization.reason !== "fatal-error") {
      return;
    }

    this.#emitDiagnostic({
      level: "error",
      event: "operation/stream-failed",
      message: "A relay operation failed unexpectedly.",
      cause: finalization.error,
      context: { relay: this.options.url, reason: finalization.reason },
    });
  }

  #onUniplsLog(log: UniplsLog): void {
    this.#emitDiagnostic({
      level: log.level,
      event: log.event,
      message: log.message,
      context: { ...log.context, relay: this.options.url },
      ...(log.cause === undefined ? {} : { cause: log.cause }),
    });
  }
}

function dropFromCause(cause: unknown): UniplsDrop | undefined {
  if (typeof cause !== "object" || cause === null || !("drop" in cause)) {
    return undefined;
  }

  const drop = cause.drop;

  if (typeof drop !== "object" || drop === null || !("source" in drop)) {
    return undefined;
  }

  return drop as UniplsDrop;
}

function createStreamObservable(
  createHandle: (
    next: (packet: MessagePacket) => void,
  ) => SubscriptionHandle<StreamFinalization<MessagePacket>>,
  onFailure?: (finalization: Extract<StreamFinalization<MessagePacket>, { ok: false }>) => void,
): Observable<MessagePacket> {
  return new Observable((subscriber) => {
    let settled = false;
    const handle = createHandle((packet) => {
      if (!settled) {
        subscriber.next(packet);
      }
    });

    void handle.closed.then((finalization) => {
      if (settled) {
        return;
      }

      settled = true;

      if (finalization.ok) {
        subscriber.complete();
      } else {
        onFailure?.(finalization);
        subscriber.error(
          new NostrTransportOperationError(finalization.reason, {
            cause: finalization.error,
          }),
        );
      }
    });

    return () => {
      if (settled) {
        return;
      }

      settled = true;

      handle.unsubscribe();
    };
  });
}

function createUniplsReconnector(
  relay: RelayUrl,
  reconnector: ConnectionReconnector,
  emitState: (state: ConnectionState) => void,
  getConnectionHealth: (() => ConnectionReconnectorContext["health"]) | undefined,
  attemptCoordinator: ConnectionAttemptCoordinator,
  onPolicyError: (cause: unknown) => void,
): UniplsReconnector {
  return {
    setup(actions, context) {
      const controller = new AbortController();
      const abort = () => controller.abort();

      context.signal.addEventListener("abort", abort, { once: true });

      if (context.signal.aborted) {
        abort();
      }

      const signal = controller.signal;
      const reason = context.drop
        ? failureFromDrop(context.drop)
        : failureFromCause("connection-failed", context.cause);

      // Return cleanup immediately so delegated policies can interrupt all waits.
      void (async () => {
        const decision = await attemptCoordinator.prepare(
          signal,
          context.attempt,
          reason,
          (reportWaiting) =>
            reconnector.reconnect({
              relay,
              phase: context.origin === "initial" ? "initial" : "recovery",
              attempt: context.attempt,
              reason: {
                ...reason,
                ...(reason.detector ? { detector: { ...reason.detector } } : {}),
              },
              signal,
              health: { ...(getConnectionHealth?.() ?? retryHealth(context)) },
              reportWaiting,
            }),
          () => retryHealth(context),
        );

        if (signal.aborted) {
          return;
        }

        switch (decision.action) {
          case "retry": {
            if (!signal.aborted) {
              emitState(Object.freeze({ state: "retrying", attempt: context.attempt }));
              actions.reconnect();
            }

            break;
          }
          case "cancel":
            actions.cancel();
            break;
          case "exhaust":
            actions.exhaust(decision.cause);
            break;
        }
      })().catch((cause) => {
        if (!signal.aborted) {
          onPolicyError(cause);
          actions.exhaust(new ConnectionPolicyError(cause));
        }
      });

      return () => {
        context.signal.removeEventListener("abort", abort);
        controller.abort();
      };
    },
  };
}

function createUniplsDropDetector(
  relay: RelayUrl,
  detector: ConnectionDropDetector,
): UniplsDropDetector<Nostr.ToRelayMessage.Any, MessagePacket> {
  return {
    ...(detector.name === undefined ? {} : { name: detector.name }),
    setup(context) {
      const wrapped: ConnectionDropDetectorContext = {
        relay,
        detector: Object.freeze({ ...context.detector }),
        signal: context.signal,
        defer: (disposer, options) => context.defer(disposer, options),
        sessionSignal: context.sessionSignal ?? context.signal,
        drop: (report) =>
          context.drop(
            report && {
              reason: report.reason,
              metadata: {
                ...report.details,
                ...(report.affectsRelayHealth === false ? { "rx-nostr:ignore-health": true } : {}),
              },
            },
          ),
        request: ({ query, selector, timeout, signal }) =>
          context
            .request({
              query,
              selector: (packet) => packet.type !== "unknown" && selector(packet.message),
              ...(timeout === undefined ? {} : { timeout }),
              ...(signal === undefined ? {} : { signal }),
            })
            .then((packet) => {
              if (packet.type === "unknown") {
                throw new TypeError("A drop detector received an unsupported relay message.");
              }

              return packet.message;
            }),
        guard: (callback) => context.guard(callback),
        run: (task) => context.run(task),
      };

      return detector.setup(Object.freeze(wrapped));
    },
  };
}

function stateFromLifecycle(snapshot: UniplsLifecycleSnapshot): ConnectionState | undefined {
  switch (snapshot.phase) {
    case "open":
      return Object.freeze({ state: "connected" });
    case "connecting":
    case "provisioning":
      if (snapshot.status === "attempting") {
        if (snapshot.origin === "initial" && snapshot.attempt === 1) {
          return Object.freeze({ state: "connecting", attempt: 1 });
        }

        return Object.freeze({
          state: "retrying",
          attempt: snapshot.origin === "initial" ? snapshot.attempt - 1 : snapshot.attempt,
        });
      }

      return undefined;
    case "recovering":
      return undefined;
    case "closed":
      if (snapshot.reason === "idle" || snapshot.reason === "user") {
        return Object.freeze({ state: "dormant" });
      }

      return Object.freeze({
        state: "failed",
        attempt: latestFailureAttempt(snapshot.attempts),
        reason: terminalFailure(snapshot),
      });
  }
}

function attemptFailed(
  previous: UniplsLifecycleSnapshot,
  current: UniplsLifecycleSnapshot,
): boolean {
  const wasAttempting =
    (previous.phase === "connecting" || previous.phase === "provisioning") &&
    previous.status === "attempting";
  const nowWaiting =
    (current.phase === "connecting" && current.status === "waiting") ||
    current.phase === "recovering";

  return wasAttempting && nowWaiting;
}

function failedAttemptFromTransition(
  previous: UniplsLifecycleSnapshot,
  current: UniplsLifecycleSnapshot,
): Extract<ConnectionAttemptSnapshot, { outcome: "failed" }> | undefined {
  if (!attemptFailed(previous, current) || !("attempts" in current)) {
    return undefined;
  }

  const attempt = current.attempts.at(-1);

  return attempt?.outcome === "failed" ? attempt : undefined;
}

function terminalFailure(
  snapshot: Extract<
    UniplsLifecycleSnapshot,
    { phase: "closed"; reason: "open-failed" | "dropped" }
  >,
): ConnectionFailure {
  if (snapshot.cause instanceof ConnectionPolicyError) {
    return failureFromCause("policy-error", snapshot.cause);
  }

  const exhausted =
    snapshot.outcome === "attempts-exhausted" || snapshot.outcome === "recovery-exhausted";

  if (exhausted) {
    const causeFailure = failureFromCause("retry-exhausted", snapshot.cause);

    return Object.freeze({
      ...causeFailure,
      ...(snapshot.drop?.close?.reason ? { message: snapshot.drop.close.reason } : {}),
      ...(snapshot.drop?.close ? { code: snapshot.drop.close.code } : {}),
    });
  }
  if (snapshot.drop) {
    return failureFromDrop(snapshot.drop);
  }

  return failureFromCause("connection-failed", snapshot.cause);
}

function latestFailureAttempt(attempts: readonly ConnectionAttemptSnapshot[]): number {
  const lastReady = attempts.findLastIndex((candidate) => candidate.outcome === "ready");

  return (
    attempts.slice(lastReady + 1).findLast((candidate) => candidate.outcome === "failed")
      ?.attempt ?? 1
  );
}

function sameConnectionState(left: ConnectionState, right: ConnectionState): boolean {
  if (left.state !== right.state) {
    return false;
  }
  if (left.state === "dormant" || left.state === "disposed") {
    return true;
  }
  if (right.state === "dormant" || right.state === "disposed") {
    return false;
  }
  if (left.state === "connected" || right.state === "connected") {
    return left.state === right.state;
  }
  if (left.state === "waiting-for-connection" || right.state === "waiting-for-connection") {
    return (
      left.state === "waiting-for-connection" &&
      right.state === "waiting-for-connection" &&
      left.attempt === right.attempt &&
      JSON.stringify(left.suppressionReasons) === JSON.stringify(right.suppressionReasons) &&
      (left.reason === undefined || right.reason === undefined
        ? left.reason === right.reason
        : sameFailure(left.reason, right.reason))
    );
  }
  if (left.attempt !== right.attempt) {
    return false;
  }
  if (left.state === "failed" && right.state === "failed") {
    return sameFailure(left.reason, right.reason);
  }

  return left.state === right.state;
}

function sameFailure(left: ConnectionFailure, right: ConnectionFailure): boolean {
  return (
    left.kind === right.kind &&
    left.message === right.message &&
    left.code === right.code &&
    JSON.stringify(left.detector) === JSON.stringify(right.detector)
  );
}

function retryHealth(context: ReconnectionContext): ConnectionReconnectorContext["health"] {
  let consecutiveFailures = 0;
  let firstFailureAt: number | undefined;
  let lastConnectedAt: number | undefined;
  let lastFailureAt: number | undefined;

  for (const attempt of context.attempts) {
    if (attempt.outcome === "ready") {
      consecutiveFailures = 0;
      firstFailureAt = undefined;
      lastConnectedAt = attempt.endedAt;
    } else if (attempt.outcome === "failed") {
      firstFailureAt ??= attempt.endedAt;

      consecutiveFailures++;

      lastFailureAt = attempt.endedAt;
    }
  }

  if (context.origin === "recovery" && context.drop && !ignoresRelayHealth(context.drop)) {
    firstFailureAt ??= context.drop.detectedAt;

    consecutiveFailures++;

    lastFailureAt = Math.max(lastFailureAt ?? context.drop.detectedAt, context.drop.detectedAt);
  }

  return Object.freeze({
    consecutiveFailures,
    ...(firstFailureAt === undefined ? {} : { firstFailureAt }),
    ...(lastConnectedAt === undefined ? {} : { lastConnectedAt }),
    ...(lastFailureAt === undefined ? {} : { lastFailureAt }),
  });
}

class ConnectionPolicyError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : "Connection policy failed.", { cause });
  }
}

function ignoresRelayHealth(drop: UniplsDrop | undefined): boolean {
  return (
    drop?.source.type === "detector" && drop.source.metadata?.["rx-nostr:ignore-health"] === true
  );
}

function failureFromDrop(drop: UniplsDrop): ConnectionFailure {
  return Object.freeze({
    kind: "connection-dropped",
    ...(drop.source.type === "detector"
      ? {
          detector: {
            ...drop.source.detector,
            ...(drop.source.reason === undefined ? {} : { reason: drop.source.reason }),
          },
        }
      : {}),
    ...(drop.close?.reason ? { message: drop.close.reason } : {}),
    ...(drop.close ? { code: drop.close.code } : {}),
  });
}

function failureFromCause(kind: ConnectionFailure["kind"], cause: unknown): ConnectionFailure {
  return Object.freeze({
    kind,
    ...(cause instanceof Error ? { message: cause.message } : {}),
  });
}

function diagnosticFromDrop(drop: UniplsDrop): NostrTransportDiagnostic {
  return {
    level: "warning",
    event: "connection/dropped",
    message: "The relay connection dropped unexpectedly.",
    ...(drop.cause === undefined ? {} : { cause: drop.cause }),
    context: { ...dropContext(drop), detectedAt: drop.detectedAt },
  };
}

function dropContext(drop: UniplsDrop): Record<string, unknown> {
  return {
    dropSource: drop.source.type,
    ...(drop.close === undefined
      ? {}
      : {
          closeCode: drop.close.code,
          closeReason: drop.close.reason,
          wasClean: drop.close.wasClean,
        }),
  };
}
