/** Transport-independent failure information exposed by rx-nostr. */
export interface ConnectionFailure {
  readonly kind: "connection-failed" | "connection-dropped" | "retry-exhausted" | "protocol-error";
  readonly message?: string;
  readonly code?: number;
}

/** A snapshot of one relay connection's rx-nostr lifecycle state. */
export type ConnectionState =
  | Readonly<{ state: "dormant" }>
  | Readonly<{ state: "connecting"; attempt: number }>
  | Readonly<{ state: "connected" }>
  | Readonly<{
      state: "waiting-for-retry";
      attempt: number;
      delay: number;
      reason: ConnectionFailure;
    }>
  | Readonly<{ state: "retrying"; attempt: number }>
  | Readonly<{
      state: "failed";
      attempt: number;
      reason: ConnectionFailure;
    }>
  | Readonly<{ state: "disposed" }>;

export type ConnectionStateSymbol = ConnectionState["state"];
