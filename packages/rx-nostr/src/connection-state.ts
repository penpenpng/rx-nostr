/** Transport-independent failure information exposed by rx-nostr. */
export interface ConnectionFailure {
  kind:
    | "connection-failed"
    | "connection-dropped"
    | "retry-exhausted"
    | "protocol-error"
    | "policy-error";
  message?: string;
  code?: number;
  detector?: Readonly<{ registrationIndex: number; name?: string; reason?: string }>;
}

/** Optional explanation supplied by the implementation that owns a wait. */
export interface ConnectionSuppressionReason {
  /** Common classification, independent of the implementation supplying the reason. */
  category: "relay-health" | "retry-backoff" | "environment" | "coordination";
  source: string;
  /** Implementation-defined code, interpreted together with source. */
  kind: string;
  details?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface ConnectionWaitInfo {
  suppressionReasons?: readonly ConnectionSuppressionReason[];
}

/** @internal Copies provider-owned explanations before publishing a state. */
export function copySuppressionReasons(
  suppressionReasons: readonly ConnectionSuppressionReason[],
): ConnectionSuppressionReason[] {
  return suppressionReasons.map((suppressionReason) => ({
    ...suppressionReason,
    ...(suppressionReason.details ? { details: { ...suppressionReason.details } } : {}),
  }));
}

/** A snapshot of one relay connection's rx-nostr lifecycle state. */
export type ConnectionState =
  | { state: "dormant" }
  | {
      state: "waiting-for-connection";
      /** Retry attempt counter; zero before the first connection attempt. */
      attempt: number;
      suppressionReasons?: readonly ConnectionSuppressionReason[];
      /** Most recent failure or drop, if any. */
      reason?: ConnectionFailure;
    }
  | { state: "connecting"; attempt: number }
  | { state: "connected" }
  | { state: "retrying"; attempt: number }
  | {
      state: "failed";
      attempt: number;
      reason: ConnectionFailure;
    }
  | { state: "disposed" };

export type ConnectionStateSymbol = ConnectionState["state"];
