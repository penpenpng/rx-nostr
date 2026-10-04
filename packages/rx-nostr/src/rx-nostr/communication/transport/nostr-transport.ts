import type * as Nostr from "nostr-typedef";
import { BehaviorSubject, Observable, Subject, type Subscription } from "rxjs";
import {
  Unipls,
  type ConnectionAttemptSnapshot,
  type ReconnectionContext,
  type StreamFinalization,
  type SubscriptionHandle,
  type UniplsDropDetector,
  type UniplsDrop,
  type UniplsDropRetryStrategy,
  type UniplsLifecycleSnapshot,
  type UniplsLog,
  type UniplsRetryStrategy,
  type WebSocketConstructor as UniplsWebSocketConstructor,
} from "unipls";

import type {
  ConnectionDropDetector,
  ConnectionDropDetectorContext,
} from "../../../connection-drop-detector/index.ts";
import type {
  ConnectionReconnectorContext,
  ConnectionReconnector,
} from "../../../connection-reconnector/index.ts";
import type { ConnectionFailure, ConnectionState } from "../../../connection-state.ts";
import type { RxNostrDiagnostic } from "../../../diagnostics/index.ts";
import type { RelayUrl } from "../../../libs/relay-urls.ts";
import type { MessagePacket } from "../../../packets/index.ts";
import type { WebSocketConstructor } from "../../../types/index.ts";
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

  constructor(readonly options: NostrTransportOptions) {
    this.#client = new Unipls({
      url: options.url,
      serializer: serializeNostrMessage,
      deserializer: (data) => decodeRelayMessage(data, options.url),
      WebSocket: options.WebSocket as UniplsWebSocketConstructor | undefined,
      timeout: options.timeout,
      reconnector: options.reconnector
        ? createUniplsReconnector(
            options.url,
            options.reconnector,
            (state) => this.#emitState(state),
            options.getConnectionHealth,
          )
        : undefined,
      dropDetectors: options.dropDetectors?.map((detector) =>
        createUniplsDropDetector(options.url, detector),
      ),
      logSink: (log) => this.#onUniplsLog(log),
    });

    this.#removeListeners.push(
      this.#client.on("message", ({ message }) => this.messages$.next(message)),
      this.#client.on("lifecycle", ({ previous, current }) => this.#onLifecycle(previous, current)),
      this.#client.on("dropped", ({ drop }) => this.#emitDiagnostic(diagnosticFromDrop(drop))),
    );
  }

  open(): Promise<void> {
    return this.#client.open();
  }

  close(): Promise<void> {
    return this.#client.close();
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

  listen(options: NostrTransportListenOptions = {}): Observable<MessagePacket> {
    return createStreamObservable(
      (onMessage) => this.#client.listen({ ...options, onMessage }),
      (finalization) => this.#emitStreamFailureDiagnostic(finalization),
    );
  }

  subscribe(options: NostrTransportSubscribeOptions): Observable<MessagePacket> {
    // AUTH remains a direct transport operation. Ordinary operations own their
    // resend here so that recovery cannot bypass the authentication barrier.
    const raw = (retry = options.retry) =>
      createStreamObservable(
        (onMessage) => this.#client.subscribe({ ...options, retry, onMessage }),
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
        if (starting || !waiting || subscriber.closed || this.state$.value.state !== "connected")
          return;
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
          )
            return;
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
              } else subscriber.error(error);
            },
          });
        } catch (error) {
          if (!subscriber.closed) subscriber.error(error);
        } finally {
          starting = false;
          if (waiting && this.state$.value.state === "connected" && !subscriber.closed)
            queueMicrotask(() => void start());
        }
      };
      const stateSubscription = this.state$.subscribe((state) => {
        if (state.state === "connected") void start();
        else if (state.state === "failed" && waiting)
          subscriber.error(new NostrTransportOperationError("open-error", { cause: state.reason }));
        else if (state.state === "disposed" || (state.state === "dormant" && waiting))
          subscriber.complete();
      });
      if (options.signal?.aborted) abort();
      return () => {
        controller.abort();
        options.signal?.removeEventListener("abort", abort);
        active?.unsubscribe();
        stateSubscription.unsubscribe();
      };
    });
  }

  dispose(): Promise<void> {
    if (this.#disposePromise) return this.#disposePromise;

    this.#disposePromise = (async () => {
      await this.#client.close();
      for (const remove of this.#removeListeners.splice(0)) remove();
      this.#closeDirectoryConnection?.();
      this.#closeDirectoryConnection = undefined;
      this.#emitState(Object.freeze({ state: "disposed" }));
      this.messages$.complete();
      this.state$.complete();
    })();
    return this.#disposePromise;
  }

  #onLifecycle(previous: UniplsLifecycleSnapshot, current: UniplsLifecycleSnapshot): void {
    if (current.phase === "open") this.#hasBeenReady = true;
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
    const state = stateFromLifecycle(current);
    if (state) this.#emitState(state);
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
      if (current.phase !== "closed" || current.reason !== "user") {
        this.options.onConnectionFailed?.();
      }
      return;
    }
    if (attemptFailed(previous, current)) {
      this.options.onConnectionFailed?.();
    }
  }

  #emitState(state: NostrTransportState): void {
    if (!sameConnectionState(this.state$.value, state)) this.state$.next(state);
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
    if (finalization.reason !== "fatal-error") return;
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
  if (typeof cause !== "object" || cause === null || !("drop" in cause)) return undefined;
  const drop = cause.drop;
  if (typeof drop !== "object" || drop === null || !("source" in drop)) return undefined;
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
      if (!settled) subscriber.next(packet);
    });

    void handle.closed.then((finalization) => {
      if (settled) return;
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
      if (settled) return;
      settled = true;
      handle.unsubscribe();
    };
  });
}

function createUniplsReconnector(
  relay: RelayUrl,
  reconnector: ConnectionReconnector,
  emitState: (state: ConnectionState) => void,
  getConnectionHealth?: () => ConnectionReconnectorContext["health"],
) {
  return {
    async setup(
      actions: {
        reconnect(): void;
        cancel(): void;
        exhaust(cause?: unknown): void;
      },
      context: ReconnectionContext,
    ): Promise<void> {
      const reason = context.drop
        ? failureFromDrop(context.drop)
        : failureFromCause("connection-failed", context.cause);
      const decision = await reconnector.reconnect({
        relay,
        phase: context.origin === "initial" ? "initial" : "recovery",
        attempt: context.attempt,
        reason: { ...reason },
        signal: context.signal,
        health: { ...(getConnectionHealth?.() ?? retryHealth(context)) },
      });

      if (context.signal.aborted) return;
      switch (decision.action) {
        case "retry":
          if (!Number.isFinite(decision.delay) || decision.delay < 0) {
            actions.exhaust(new RangeError("A retry delay must be a finite non-negative number."));
            return;
          }
          emitState(
            Object.freeze({
              state: "waiting-for-retry",
              attempt: context.attempt,
              delay: decision.delay,
              reason,
            }),
          );
          if (decision.delay > 0) {
            await abortableDelay(decision.delay, context.signal);
          }
          if (!context.signal.aborted) {
            emitState(Object.freeze({ state: "retrying", attempt: context.attempt }));
            actions.reconnect();
          }
          return;
        case "cancel":
          actions.cancel();
          return;
        case "exhaust":
          actions.exhaust(decision.cause);
          return;
      }
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
        drop: () => context.drop(),
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

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, milliseconds);
    signal.addEventListener("abort", done, { once: true });

    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });
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
  if (!attemptFailed(previous, current) || !("attempts" in current)) return undefined;
  const attempt = current.attempts.at(-1);
  return attempt?.outcome === "failed" ? attempt : undefined;
}

function terminalFailure(
  snapshot: Extract<
    UniplsLifecycleSnapshot,
    { phase: "closed"; reason: "open-failed" | "dropped" }
  >,
): ConnectionFailure {
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
  if (snapshot.drop) return failureFromDrop(snapshot.drop);
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
  if (left.state !== right.state) return false;
  if (left.state === "dormant" || left.state === "disposed") return true;
  if (right.state === "dormant" || right.state === "disposed") return false;
  if (left.state === "connected" || right.state === "connected") {
    return left.state === right.state;
  }
  if (left.attempt !== right.attempt) return false;
  if (left.state === "waiting-for-retry" && right.state === "waiting-for-retry") {
    return left.delay === right.delay && sameFailure(left.reason, right.reason);
  }
  if (left.state === "failed" && right.state === "failed") {
    return sameFailure(left.reason, right.reason);
  }
  return left.state === right.state;
}

function sameFailure(left: ConnectionFailure, right: ConnectionFailure): boolean {
  return left.kind === right.kind && left.message === right.message && left.code === right.code;
}

function retryHealth(context: ReconnectionContext): ConnectionReconnectorContext["health"] {
  let consecutiveFailures = 0;
  let lastConnectedAt: number | undefined;
  let lastFailureAt: number | undefined;

  for (const attempt of context.attempts) {
    if (attempt.outcome === "ready") {
      consecutiveFailures = 0;
      lastConnectedAt = attempt.endedAt;
    } else if (attempt.outcome === "failed") {
      consecutiveFailures++;
      lastFailureAt = attempt.endedAt;
    }
  }
  if (context.origin === "recovery" && context.drop) {
    consecutiveFailures++;
    lastFailureAt = Math.max(lastFailureAt ?? context.drop.detectedAt, context.drop.detectedAt);
  }

  return Object.freeze({
    consecutiveFailures,
    ...(lastConnectedAt === undefined ? {} : { lastConnectedAt }),
    ...(lastFailureAt === undefined ? {} : { lastFailureAt }),
  });
}

function failureFromDrop(drop: UniplsDrop): ConnectionFailure {
  return Object.freeze({
    kind: "connection-dropped",
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
