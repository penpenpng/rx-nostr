import type * as Nostr from "nostr-typedef";
import { BehaviorSubject, Observable, Subject } from "rxjs";
import {
  Unipls,
  type ConnectionAttemptSnapshot,
  type ReconnectionContext,
  type StreamFinalization,
  type SubscriptionHandle,
  type UniplsDiagnostic,
  type UniplsDrop,
  type UniplsDropRetryStrategy,
  type UniplsLifecycleSnapshot,
  type UniplsRetryStrategy,
  type WebSocketConstructor as UniplsWebSocketConstructor,
} from "unipls";
import type {
  ConnectionRetryContext,
  ConnectionRetryer,
} from "../../connection-retryer/index.ts";
import type {
  ConnectionFailure,
  ConnectionState,
} from "../../connection-state.ts";
import type { RelayUrl } from "../../libs/relay-urls.ts";
import type { MessagePacket } from "../../packets/index.ts";
import type { WebSocketConstructor } from "../../types/index.ts";
import { decodeRelayMessage, serializeNostrMessage } from "./nostr-codec.ts";

export type NostrTransportState = ConnectionState;

export interface NostrTransportDiagnostic {
  readonly type: string;
  readonly severity: "warning" | "error";
  readonly cause?: unknown;
}

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
  readonly retryer?: ConnectionRetryer;
  readonly onConnectionOpened?: () => () => void;
  readonly onConnectionFailed?: () => void;
  readonly getConnectionHealth?: () => ConnectionRetryContext["health"];
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
  readonly messages$ = new Subject<MessagePacket>();
  readonly state$ = new BehaviorSubject<NostrTransportState>(
    Object.freeze({ state: "dormant" }),
  );
  readonly diagnostics$ = new Subject<NostrTransportDiagnostic>();

  readonly #client: Unipls<Nostr.ToRelayMessage.Any, MessagePacket>;
  readonly #removeListeners: Array<() => void> = [];
  #closeDirectoryConnection?: () => void;
  #disposePromise?: Promise<void>;

  constructor(readonly options: NostrTransportOptions) {
    this.#client = new Unipls({
      url: options.url,
      serializer: serializeNostrMessage,
      deserializer: (data) => decodeRelayMessage(data, options.url),
      WebSocket: options.WebSocket as UniplsWebSocketConstructor | undefined,
      timeout: options.timeout,
      reconnector: options.retryer
        ? createUniplsReconnector(
            options.url,
            options.retryer,
            (state) => this.#emitState(state),
            options.getConnectionHealth,
          )
        : undefined,
    });

    this.#removeListeners.push(
      this.#client.on("message", ({ message }) => this.messages$.next(message)),
      this.#client.on("lifecycle", ({ previous, current }) =>
        this.#onLifecycle(previous, current),
      ),
      this.#client.on("diagnostic", (diagnostic) =>
        this.diagnostics$.next(mapDiagnostic(diagnostic)),
      ),
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
    return createStreamObservable((next) =>
      this.#client.listen({ ...options, next }),
    );
  }

  subscribe(
    options: NostrTransportSubscribeOptions,
  ): Observable<MessagePacket> {
    return createStreamObservable((next) =>
      this.#client.subscribe({ ...options, next }),
    );
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
      this.diagnostics$.complete();
    })();
    return this.#disposePromise;
  }

  #onLifecycle(
    previous: UniplsLifecycleSnapshot,
    current: UniplsLifecycleSnapshot,
  ): void {
    this.#reportHealth(previous, current);
    const state = stateFromLifecycle(current);
    if (state) this.#emitState(state);
  }

  #reportHealth(
    previous: UniplsLifecycleSnapshot,
    current: UniplsLifecycleSnapshot,
  ): void {
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
}

function createStreamObservable(
  createHandle: (
    next: (packet: MessagePacket) => void,
  ) => SubscriptionHandle<StreamFinalization<MessagePacket>>,
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
  retryer: ConnectionRetryer,
  emitState: (state: ConnectionState) => void,
  getConnectionHealth?: () => ConnectionRetryContext["health"],
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
      const decision = await retryer.retry({
        relay,
        phase: context.origin === "initial" ? "initial" : "recovery",
        attempt: context.attempt,
        reason,
        signal: context.signal,
        health: getConnectionHealth?.() ?? retryHealth(context),
      });

      if (context.signal.aborted) return;
      switch (decision.action) {
        case "retry":
          if (!Number.isFinite(decision.delay) || decision.delay < 0) {
            actions.exhaust(
              new RangeError(
                "A retry delay must be a finite non-negative number.",
              ),
            );
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
            emitState(
              Object.freeze({ state: "retrying", attempt: context.attempt }),
            );
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

function abortableDelay(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
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

function stateFromLifecycle(
  snapshot: UniplsLifecycleSnapshot,
): ConnectionState | undefined {
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
          attempt:
            snapshot.origin === "initial"
              ? snapshot.attempt - 1
              : snapshot.attempt,
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

function terminalFailure(
  snapshot: Extract<
    UniplsLifecycleSnapshot,
    { phase: "closed"; reason: "open-failed" | "dropped" }
  >,
): ConnectionFailure {
  const exhausted =
    snapshot.outcome === "attempts-exhausted" ||
    snapshot.outcome === "recovery-exhausted";
  if (exhausted) {
    const causeFailure = failureFromCause("retry-exhausted", snapshot.cause);
    return Object.freeze({
      ...causeFailure,
      ...(snapshot.drop?.close?.reason
        ? { message: snapshot.drop.close.reason }
        : {}),
      ...(snapshot.drop?.close ? { code: snapshot.drop.close.code } : {}),
    });
  }
  if (snapshot.drop) return failureFromDrop(snapshot.drop);
  return failureFromCause("connection-failed", snapshot.cause);
}

function latestFailureAttempt(
  attempts: readonly ConnectionAttemptSnapshot[],
): number {
  const lastReady = attempts.findLastIndex(
    (candidate) => candidate.outcome === "ready",
  );
  return (
    attempts
      .slice(lastReady + 1)
      .findLast((candidate) => candidate.outcome === "failed")?.attempt ?? 1
  );
}

function sameConnectionState(
  left: ConnectionState,
  right: ConnectionState,
): boolean {
  if (left.state !== right.state) return false;
  if (left.state === "dormant" || left.state === "disposed") return true;
  if (right.state === "dormant" || right.state === "disposed") return false;
  if (left.state === "connected" || right.state === "connected") {
    return left.state === right.state;
  }
  if (left.attempt !== right.attempt) return false;
  if (
    left.state === "waiting-for-retry" &&
    right.state === "waiting-for-retry"
  ) {
    return left.delay === right.delay && sameFailure(left.reason, right.reason);
  }
  if (left.state === "failed" && right.state === "failed") {
    return sameFailure(left.reason, right.reason);
  }
  return left.state === right.state;
}

function sameFailure(
  left: ConnectionFailure,
  right: ConnectionFailure,
): boolean {
  return (
    left.kind === right.kind &&
    left.message === right.message &&
    left.code === right.code
  );
}

function retryHealth(
  context: ReconnectionContext,
): ConnectionRetryContext["health"] {
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
    lastFailureAt = Math.max(
      lastFailureAt ?? context.drop.detectedAt,
      context.drop.detectedAt,
    );
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

function failureFromCause(
  kind: ConnectionFailure["kind"],
  cause: unknown,
): ConnectionFailure {
  return Object.freeze({
    kind,
    ...(cause instanceof Error ? { message: cause.message } : {}),
  });
}

function mapDiagnostic(diagnostic: UniplsDiagnostic): NostrTransportDiagnostic {
  return Object.freeze({
    type: diagnostic.type,
    severity: diagnostic.severity,
    ...(diagnostic.type === "message-deserialization-failed" ||
    diagnostic.type === "message-predicate-failed" ||
    diagnostic.type === "stream-callback-failed" ||
    diagnostic.type === "resource-cleanup-failed" ||
    diagnostic.type === "drop-detector-failed" ||
    diagnostic.type === "reconnector-failed"
      ? { cause: diagnostic.cause }
      : {}),
  });
}
