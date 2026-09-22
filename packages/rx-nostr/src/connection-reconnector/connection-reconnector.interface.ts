import type { ConnectionFailure } from "../connection-state.ts";
import type { RelayUrl } from "../libs/relay-urls.ts";

export interface ConnectionReconnector {
  reconnect(
    context: ConnectionReconnectorContext,
  ): ConnectionReconnectorDecision | Promise<ConnectionReconnectorDecision>;
}

export interface ConnectionReconnectorContext {
  relay: RelayUrl;
  phase: "initial" | "recovery";
  /** One-based number of the retry that is being considered. */
  attempt: number;
  reason: ConnectionFailure;
  signal: AbortSignal;
  health: {
    consecutiveFailures: number;
    lastConnectedAt?: number;
    lastFailureAt?: number;
  };
}

export type ConnectionReconnectorDecision =
  | Readonly<{ action: "retry"; delay: number }>
  | Readonly<{ action: "cancel" }>
  | Readonly<{ action: "exhaust"; cause?: unknown }>;
