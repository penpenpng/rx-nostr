import type { Observable } from "rxjs";
import { describe, expectTypeOf, test } from "vitest";
import type { ConnectionFailure, ConnectionState, ConnectionStatePacket, IRxNostr } from "rx-nostr";

describe("connection state public contract", () => {
  test("uses rx-nostr-owned replayable state snapshots", () => {
    expectTypeOf<IRxNostr["monitorConnectionState"]>().returns.toEqualTypeOf<
      Observable<ConnectionStatePacket>
    >();
    expectTypeOf<ConnectionState>().toMatchTypeOf<
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
      | { state: "failed"; attempt: number; reason: ConnectionFailure }
      | { state: "disposed" }
    >();
    expectTypeOf<ConnectionStatePacket>().toHaveProperty("from");
    expectTypeOf<ConnectionStatePacket>().toHaveProperty("state");
  });
});
