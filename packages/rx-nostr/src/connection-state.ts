/** Transport-independent failure information exposed by rx-nostr. */
export interface ConnectionFailure {
  kind: "connection-failed" | "connection-dropped" | "retry-exhausted" | "protocol-error";
  message?: string;
  code?: number;
}

/** A snapshot of one relay connection's rx-nostr lifecycle state. */
export type ConnectionState =
  | { state: "dormant" }
  | { state: "connecting"; attempt: number }
  | { state: "connected" }
  | {
      state: "waiting-for-retry";
      attempt: number;
      delay: number;
      reason: ConnectionFailure;
    }
  | { state: "retrying"; attempt: number }
  | {
      state: "failed";
      attempt: number;
      reason: ConnectionFailure;
    }
  | { state: "disposed" };

export type ConnectionStateSymbol = ConnectionState["state"];
