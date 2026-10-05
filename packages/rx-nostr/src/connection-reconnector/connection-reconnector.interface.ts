import type {
  ConnectionFailure,
  ConnectionWaitInfo,
  ConnectionSuppressionReason,
} from "../connection-state.ts";
import type { RelayUrl } from "../libs/relay-urls.ts";
import type { RelayHealth } from "./relay-health-policy.ts";

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
  health: RelayHealth;
  /** Reports an implementation-owned asynchronous wait; does not schedule a retry. */
  reportWaiting?(waiting: ConnectionWaitInfo): void;
}

export type ConnectionReconnectorDecision =
  | Readonly<{
      action: "retry";
      delay: number;
      suppressionReasons?: readonly ConnectionSuppressionReason[];
    }>
  | Readonly<{ action: "cancel" }>
  | Readonly<{ action: "exhaust"; cause?: unknown }>;
