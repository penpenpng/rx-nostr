import type * as Nostr from "nostr-typedef";
import { EMPTY } from "rxjs";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { LazyFilter } from "../lazy-filter/index.ts";
import type { RelayUrl } from "../libs/index.ts";
import type { EventPacket, OkPacket } from "../packets/index.ts";
import type { IRelayCommunication } from "./relay-communication.ts";
import { QuerySession } from "./query-session.ts";

class LeaseRelay implements IRelayCommunication {
  leases = 0;
  constructor(readonly url: RelayUrl) {}
  hold() {
    this.leases++;
    let released = false;
    return () => {
      if (!released) this.leases--;
      released = true;
    };
  }
  vreq(_strategy: "forward" | "backward", _filters: LazyFilter[]) {
    return EMPTY as import("rxjs").Observable<EventPacket>;
  }
  event(_event: Nostr.Event) {
    return EMPTY as import("rxjs").Observable<OkPacket>;
  }
}

afterEach(() => vi.useRealTimers());

describe("QuerySession leases", () => {
  test("holds a segment lease through linger", () => {
    vi.useFakeTimers();
    const relay = new LeaseRelay("wss://relay.example.com");
    const session = new QuerySession({ defer: true, weak: false });
    const segment = session.beginSegment(relay, 100);

    segment.endSegment();
    expect(relay.leases).toBe(1);
    vi.advanceTimersByTime(99);
    expect(relay.leases).toBe(1);
    vi.advanceTimersByTime(1);
    expect(relay.leases).toBe(0);
    session.dispose();
  });

  test("dispose cancels linger callbacks and releases immediately", () => {
    vi.useFakeTimers();
    const relay = new LeaseRelay("wss://relay.example.com");
    const session = new QuerySession({ defer: true, weak: false });
    session.beginSegment(relay, 100).endSegment();

    session.dispose();
    expect(relay.leases).toBe(0);
    vi.runAllTimers();
    expect(relay.leases).toBe(0);
  });

  test("weak sessions never acquire a lease", () => {
    const relay = new LeaseRelay("wss://relay.example.com");
    const session = new QuerySession({ defer: false, weak: true });

    expect(session.prewarm(relay)).toBe(false);
    session.beginSegment(relay, 0).endSegment();
    expect(relay.leases).toBe(0);
    session.dispose();
  });
});
