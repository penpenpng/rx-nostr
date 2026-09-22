import type { ConnectionFailure } from "../connection-state.ts";
import type { RelayUrl } from "../libs/relay-urls.ts";

export interface ConnectionRetryer {
  retry(
    context: ConnectionRetryContext,
  ): ConnectionRetryDecision | Promise<ConnectionRetryDecision>;
}

export interface ConnectionRetryContext {
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

export type ConnectionRetryDecision =
  | Readonly<{ action: "retry"; delay: number }>
  | Readonly<{ action: "cancel" }>
  | Readonly<{ action: "exhaust"; cause?: unknown }>;
