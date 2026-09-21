import type { Observable } from "rxjs";
import { describe, expectTypeOf, test } from "vitest";
import type {
  ConnectionState,
  ConnectionStatePacket,
  IRxNostr,
} from "rx-nostr";

describe("connection state public contract", () => {
  test("uses rx-nostr-owned replayable state snapshots", () => {
    expectTypeOf<IRxNostr["monitorConnectionState"]>().returns.toEqualTypeOf<
      Observable<ConnectionStatePacket>
    >();
    expectTypeOf<ConnectionState>().toMatchTypeOf<
      | { readonly state: "dormant" }
      | { readonly state: "connecting"; readonly attempt: number }
      | { readonly state: "connected" }
      | {
          readonly state: "waiting-for-retry";
          readonly attempt: number;
          readonly delay: number;
        }
      | { readonly state: "retrying"; readonly attempt: number }
      | { readonly state: "failed"; readonly attempt: number }
      | { readonly state: "disposed" }
    >();
    expectTypeOf<ConnectionStatePacket>().toHaveProperty("from");
    expectTypeOf<ConnectionStatePacket>().toHaveProperty("state");
  });
});
