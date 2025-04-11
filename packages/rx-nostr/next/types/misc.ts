import type { Observable } from "rxjs";

/**
 * State of a WebSocket connection established with a relay.
 *
 * - `initialized`: Initialization has been completed and the connection can now be made.
 * - `connecting`: Attempting to connect for reasons other than auto-retry.
 * - `connected`: Connected.
 * - `waiting-for-retrying`: Closed unexpectedly and the next auto-retry is scheduled.
 * - `retrying`: Attempting to connect because of auto-retry.
 * - `dormant`: Closed temporary because there is no active messaging.
 * - `error`: Closed unexpectedly after the maximum number of retries. You can try to `reconnect()` manually.
 * - `rejected`: Closed by a relay with closing code 4000. You can try to reconnect, but should not do.
 * - `terminated`: Closed because of `dispose()`. Never reconnect.
 */
export type ConnectionState =
  | "initialized"
  | "connecting"
  | "connected"
  | "waiting-for-retrying"
  | "retrying"
  | "dormant"
  | "error"
  | "rejected"
  | "terminated";

export type RelayUrl = `ws://${number}` | `wss://${string}`;

export type EmitScopeConnectionPolicy = EmitScopeConnectionPolicyEntry[];
export type EmitScopeConnectionPolicyEntry =
  | ConnectionTarget
  | {
      relays: ConnectionTarget;
      trigger: ConnectionTrigger;
      lifetime: ConnectionLifetime;
    };

export type ConnectionTarget = string | string[] | Observable<string[]>;

export type ConnectionTrigger = "immediate" | "ondemand";

export type ConnectionLifetime =
  | {
      scope: "weak";
    }
  | {
      scope: "emit";
      stay?: number;
    }
  | {
      scope: "use";
      stay?: number;
    }
  | {
      scope: "instance";
    };
