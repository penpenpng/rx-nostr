import type * as Nostr from "nostr-typedef";
import { EMPTY } from "rxjs";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { LazyFilter } from "../../../lazy-filter/index.ts";
import type { RelayUrl } from "../../../libs/index.ts";
import type { EventPacket, OkPacket } from "../../../packets/index.ts";
import type { IRelayCommunication } from "../../communication/index.ts";
import { ConnectionDemandScope } from "./connection-demand-scope.ts";

class LeaseRelay implements IRelayCommunication {
  leases = 0;
  constructor(readonly url: RelayUrl) {}
  hold() {
    this.leases++;
    let released = false;

    return () => {
      if (!released) {
        this.leases--;
      }

      released = true;
    };
  }
  vreq(_strategy: "forward" | "backward", _filters: LazyFilter[]) {
    return EMPTY as import("rxjs").Observable<EventPacket>;
  }
  event(_event: Nostr.Event) {
    return EMPTY as import("rxjs").Observable<OkPacket>;
  }
  castEvent(_event: Nostr.Event) {
    return EMPTY as import("rxjs").Observable<void>;
  }
}

afterEach(() => vi.useRealTimers());

describe("ConnectionDemandScope leases", () => {
  test("notifies its owner once after all finalized demand has drained", () => {
    vi.useFakeTimers();
    const relay = new LeaseRelay("wss://relay.example.com");
    const drained = vi.fn();
    const demand = new ConnectionDemandScope({ defer: true, weak: false }, drained);

    demand.openDemandWindow(relay, 100).close();
    demand.openDemandWindow(relay, 200).close();
    demand.finish();

    vi.advanceTimersByTime(100);
    expect(relay.leases).toBe(1);
    expect(drained).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(relay.leases).toBe(0);
    expect(drained).toHaveBeenCalledOnce();
    demand.finish();
    demand.dispose();
    expect(drained).toHaveBeenCalledOnce();
  });

  test("does not schedule a late window close after disposal", () => {
    vi.useFakeTimers();
    const relay = new LeaseRelay("wss://relay.example.com");
    const demand = new ConnectionDemandScope({ defer: true, weak: false });
    const window = demand.openDemandWindow(relay, 100);

    demand.dispose();
    window.close();
    expect(relay.leases).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("holds a demand window lease through linger", () => {
    vi.useFakeTimers();
    const relay = new LeaseRelay("wss://relay.example.com");
    const connectionDemand = new ConnectionDemandScope({
      defer: true,
      weak: false,
    });
    const demandWindow = connectionDemand.openDemandWindow(relay, 100);

    demandWindow.close();
    expect(relay.leases).toBe(1);
    vi.advanceTimersByTime(99);
    expect(relay.leases).toBe(1);
    vi.advanceTimersByTime(1);
    expect(relay.leases).toBe(0);
    connectionDemand.dispose();
  });

  test("dispose cancels linger callbacks and releases immediately", () => {
    vi.useFakeTimers();
    const relay = new LeaseRelay("wss://relay.example.com");
    const connectionDemand = new ConnectionDemandScope({
      defer: true,
      weak: false,
    });

    connectionDemand.openDemandWindow(relay, 100).close();

    connectionDemand.dispose();
    expect(relay.leases).toBe(0);
    vi.runAllTimers();
    expect(relay.leases).toBe(0);
  });

  test("weak demand scopes never acquire a lease", () => {
    const relay = new LeaseRelay("wss://relay.example.com");
    const connectionDemand = new ConnectionDemandScope({
      defer: false,
      weak: true,
    });

    expect(connectionDemand.prewarm(relay)).toBe(false);
    connectionDemand.openDemandWindow(relay, 0).close();
    expect(relay.leases).toBe(0);
    connectionDemand.dispose();
  });
});
