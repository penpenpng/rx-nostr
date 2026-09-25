import type * as Nostr from "nostr-typedef";
import { EMPTY } from "rxjs";
import { describe, expect, test, vi } from "vitest";
import { ControlledWebSocketServer } from "../../__test__/helper/index.ts";
import type { LazyFilter } from "../../lazy-filter/index.ts";
import type { RelayUrl } from "../../libs/index.ts";
import type { EventPacket, OkPacket } from "../../packets/index.ts";
import { RxRelays } from "../../rx-relays/index.ts";
import { ConnectionDemandScope } from "../connection-demand-scope.ts";
import { RelayCommunication, type IRelayCommunication } from "../relay-communication.ts";
import { RelayPool, type RelayCommunicationCollection } from "../relay-pool.ts";
import { RelayWarmer } from "./relay-warmer.ts";

class LeaseRelay implements IRelayCommunication {
  leases = 0;

  constructor(readonly url: RelayUrl) {}

  hold() {
    this.leases++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.leases--;
    };
  }

  vreq(_strategy: "forward" | "backward", _filters: LazyFilter[]) {
    return EMPTY as import("rxjs").Observable<EventPacket>;
  }

  event(_event: Nostr.Event) {
    return EMPTY as import("rxjs").Observable<OkPacket>;
  }
}

class LeaseRelayCollection implements RelayCommunicationCollection<LeaseRelay> {
  readonly entries = new Map<RelayUrl, LeaseRelay>();

  get(url: RelayUrl) {
    let relay = this.entries.get(url);
    if (!relay) {
      relay = new LeaseRelay(url);
      this.entries.set(url, relay);
    }
    return relay;
  }

  forEach(relays: Iterable<RelayUrl> | null | undefined, callback: (relay: LeaseRelay) => void) {
    if (relays) for (const relay of relays) callback(this.get(relay));
  }

  map<R>(relays: Iterable<RelayUrl> | null | undefined, project: (relay: LeaseRelay) => R) {
    return relays ? [...relays].map((relay) => project(this.get(relay))) : [];
  }
}

describe("RelayWarmer", () => {
  test("tracks a dynamic hot set without making it a destination", () => {
    const collection = new LeaseRelayCollection();
    const warmer = new RelayWarmer(collection);
    const hot = new RxRelays(["wss://one.example.com"]);
    const one = collection.get("wss://one.example.com");
    const two = collection.get("wss://two.example.com");

    warmer.setHotRelays(hot);
    expect(one.leases).toBe(1);
    expect(two.leases).toBe(0);

    hot.append("wss://two.example.com");
    expect(one.leases).toBe(1);
    expect(two.leases).toBe(1);
    hot.remove("wss://one.example.com");
    expect(one.leases).toBe(0);
    expect(two.leases).toBe(1);

    warmer.unsetHotRelays();
    expect(two.leases).toBe(0);
    warmer.dispose();
    hot.dispose();
  });

  test("normalizes aliases and replaces hot sets without duplicate leases", () => {
    const collection = new LeaseRelayCollection();
    const warmer = new RelayWarmer(collection);

    warmer.setHotRelays(["wss://RELAY.example.com/"]);
    const relay = collection.get("wss://relay.example.com");
    expect(relay.leases).toBe(1);
    warmer.setHotRelays(["wss://relay.example.com"]);
    expect(relay.leases).toBe(1);

    warmer.dispose();
    warmer.dispose();
    expect(relay.leases).toBe(0);
  });

  test("hot and query leases keep the connection independently", () => {
    const collection = new LeaseRelayCollection();
    const warmer = new RelayWarmer(collection);
    const relay = collection.get("wss://relay.example.com");
    const connectionDemand = new ConnectionDemandScope({ defer: true, weak: false });

    warmer.setHotRelays([relay.url]);
    const segment = connectionDemand.beginSegment(relay, 0);
    expect(relay.leases).toBe(2);

    segment.endSegment();
    expect(relay.leases).toBe(1);
    const active = connectionDemand.beginSegment(relay, 0);
    warmer.unsetHotRelays();
    expect(relay.leases).toBe(1);
    active.endSegment();
    expect(relay.leases).toBe(0);

    connectionDemand.dispose();
    warmer.dispose();
  });

  test("hot relay demand opens a connection without sending protocol messages", async () => {
    const server = new ControlledWebSocketServer();
    const pool = new RelayPool(
      (url) => new RelayCommunication(url, { WebSocket: server.WebSocket }),
    );
    const warmer = new RelayWarmer(pool);

    warmer.setHotRelays(["wss://relay.example.com"]);
    const states: string[] = [];
    pool
      .get("wss://relay.example.com")
      .monitorConnectionState()
      .subscribe((state) => states.push(state.state));
    server.sockets.latest.open();
    await vi.waitFor(() => expect(states).toContain("connected"));
    expect(server.sockets.latest.sent).toEqual([]);

    warmer.unsetHotRelays();
    await vi.waitFor(() => expect(server.sockets.latest.closeRequests).toHaveLength(1));
    server.sockets.latest.acknowledgeClose();
    warmer.dispose();
    pool.dispose();
  });
});
