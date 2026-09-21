import type * as Nostr from "nostr-typedef";
import { Observable, Subject } from "rxjs";
import {
  Unipls,
  type StreamFinalization,
  type SubscriptionHandle,
  type UniplsDiagnostic,
  type UniplsDrop,
  type UniplsDropRetryStrategy,
  type UniplsRetryStrategy,
  type WebSocketConstructor as UniplsWebSocketConstructor,
} from "unipls";
import type {
  ConnectionRetryContext,
  ConnectionRetryer,
} from "../../connection-retryer/index.ts";
import type { ConnectionFailure } from "../../connection-state.ts";
import type { RelayUrl } from "../../libs/relay-urls.ts";
import type { MessagePacket } from "../../packets/index.ts";
import type { WebSocketConstructor } from "../../types/index.ts";
import { decodeRelayMessage, serializeNostrMessage } from "./nostr-codec.ts";

export type NostrTransportState =
  | Readonly<{ state: "connecting" }>
  | Readonly<{ state: "connected" }>
  | Readonly<{ state: "dropped"; failure: ConnectionFailure }>
  | Readonly<{ state: "failed"; failure: ConnectionFailure }>
  | Readonly<{ state: "closed" }>
  | Readonly<{ state: "disposed" }>;

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
}

export interface NostrTransportListenOptions {
  readonly selector?: (packet: MessagePacket) => boolean;
  readonly terminator?: (packet: MessagePacket) => boolean;
  readonly timeout?: number;
  readonly retry?: UniplsDropRetryStrategy;
}

export interface NostrTransportSubscribeOptions {
  readonly query: Nostr.ToRelayMessage.Any;
  readonly selector: (packet: MessagePacket) => boolean;
  readonly terminator?: (packet: MessagePacket) => boolean;
  readonly timeout?: number;
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
  readonly state$ = new Subject<NostrTransportState>();
  readonly diagnostics$ = new Subject<NostrTransportDiagnostic>();

  readonly #client: Unipls<Nostr.ToRelayMessage.Any, MessagePacket>;
  readonly #removeListeners: Array<() => void> = [];
  #disposePromise?: Promise<void>;

  constructor(readonly options: NostrTransportOptions) {
    this.#client = new Unipls({
      url: options.url,
      serializer: serializeNostrMessage,
      deserializer: (data) => decodeRelayMessage(data, options.url),
      WebSocket: options.WebSocket as UniplsWebSocketConstructor | undefined,
      timeout: options.timeout,
      reconnector: options.retryer
        ? createUniplsReconnector(options.url, options.retryer)
        : undefined,
    });

    this.#removeListeners.push(
      this.#client.on("message", ({ message }) => this.messages$.next(message)),
      this.#client.on("open", () =>
        this.state$.next(Object.freeze({ state: "connected" })),
      ),
      this.#client.on("dropped", ({ drop }) =>
        this.state$.next(
          Object.freeze({
            state: "dropped",
            failure: failureFromDrop(drop),
          }),
        ),
      ),
      this.#client.on("failed", ({ error }) =>
        this.state$.next(
          Object.freeze({
            state: "failed",
            failure: failureFromCause("connection-failed", error),
          }),
        ),
      ),
      this.#client.on("closed", ({ error }) => {
        if (error) {
          this.state$.next(
            Object.freeze({
              state: "failed",
              failure: failureFromCause("retry-exhausted", error),
            }),
          );
        } else {
          this.state$.next(Object.freeze({ state: "closed" }));
        }
      }),
      this.#client.on("diagnostic", (diagnostic) =>
        this.diagnostics$.next(mapDiagnostic(diagnostic)),
      ),
    );
  }

  open(): Promise<void> {
    this.state$.next(Object.freeze({ state: "connecting" }));
    return this.#client.open();
  }

  close(): Promise<void> {
    return this.#client.close();
  }

  cast(
    query: Nostr.ToRelayMessage.Any,
    options: { readonly timeout?: number; readonly signal?: AbortSignal } = {},
  ): Promise<void> {
    return this.#client.cast({ query, ...options });
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
      this.state$.next(Object.freeze({ state: "disposed" }));
      this.messages$.complete();
      this.state$.complete();
      this.diagnostics$.complete();
    })();
    return this.#disposePromise;
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

function createUniplsReconnector(relay: RelayUrl, retryer: ConnectionRetryer) {
  return {
    async setup(
      actions: {
        reconnect(): void;
        cancel(): void;
        exhaust(cause?: unknown): void;
      },
      context: import("unipls").ReconnectionContext,
    ): Promise<void> {
      const decision = await retryer.retry({
        relay,
        phase: context.origin === "initial" ? "initial" : "recovery",
        attempt: context.attempt,
        reason: context.drop
          ? failureFromDrop(context.drop)
          : failureFromCause("connection-failed", context.cause),
        signal: context.signal,
        health: retryHealth(context.attempts),
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
          if (decision.delay > 0) {
            await abortableDelay(decision.delay, context.signal);
          }
          if (!context.signal.aborted) actions.reconnect();
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

function retryHealth(
  attempts: readonly import("unipls").ConnectionAttemptSnapshot[],
): ConnectionRetryContext["health"] {
  let consecutiveFailures = 0;
  let lastConnectedAt: number | undefined;
  let lastFailureAt: number | undefined;

  for (const attempt of attempts) {
    if (attempt.outcome === "ready") {
      consecutiveFailures = 0;
      lastConnectedAt = attempt.endedAt;
    } else if (attempt.outcome === "failed") {
      consecutiveFailures++;
      lastFailureAt = attempt.endedAt;
    }
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
