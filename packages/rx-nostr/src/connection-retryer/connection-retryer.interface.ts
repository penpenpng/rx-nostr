import type { ConnectionFailure } from "../connection-state.ts";
import type { RelayUrl } from "../libs/relay-urls.ts";

export interface ConnectionRetryer {
  retry(
    context: ConnectionRetryContext,
  ): ConnectionRetryDecision | Promise<ConnectionRetryDecision>;
}

export interface ConnectionRetryContext {
  readonly relay: RelayUrl;
  readonly phase: "initial" | "recovery";
  /** One-based number of the retry that is being considered. */
  readonly attempt: number;
  readonly reason: ConnectionFailure;
  readonly signal: AbortSignal;
  readonly health: Readonly<{
    consecutiveFailures: number;
    lastConnectedAt?: number;
    lastFailureAt?: number;
  }>;
}

export type ConnectionRetryDecision =
  | Readonly<{ action: "retry"; delay: number }>
  | Readonly<{ action: "cancel" }>
  | Readonly<{ action: "exhaust"; cause?: unknown }>;
