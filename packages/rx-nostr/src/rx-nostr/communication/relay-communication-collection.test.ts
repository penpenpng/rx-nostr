import { EMPTY } from "rxjs";
import { describe, expect, test, vi } from "vitest";
import type { LazyFilter } from "../../lazy-filter/index.ts";
import type { EventPacket, OkPacket } from "../../packets/index.ts";
import type * as Nostr from "nostr-typedef";
import { RelayCommunicationCollection } from "./relay-communication-collection.ts";

class FakeRelay implements Disposable {
  readonly dispose = vi.fn();
  readonly [Symbol.dispose] = this.dispose;

  constructor(readonly url: `ws://${string}` | `wss://${string}`) {}
  hold() {
    return () => {};
  }
  vreq(_strategy: "forward" | "backward", _filters: LazyFilter[]) {
    return EMPTY as typeof EMPTY & import("rxjs").Observable<EventPacket>;
  }
  event(_event: Nostr.Event) {
    return EMPTY as typeof EMPTY & import("rxjs").Observable<OkPacket>;
  }
}

describe("RelayCommunicationCollection", () => {
  test("owns one entry for every normalized URL alias", () => {
    const factory = vi.fn((url) => new FakeRelay(url));
    const collection = new RelayCommunicationCollection(factory);

    const first = collection.get("wss://RELAY.example.com/" as const);
    const second = collection.get("wss://relay.example.com" as const);

    expect(second).toBe(first);
    expect(first.url).toBe("wss://relay.example.com");
    expect(factory).toHaveBeenCalledOnce();
    expect(collection.size).toBe(1);
  });

  test("keeps idle entries until collection disposal and disposes each once", () => {
    const collection = new RelayCommunicationCollection((url) => new FakeRelay(url));
    const first = collection.get("wss://one.example.com");
    const second = collection.get("wss://two.example.com");

    expect(collection.get("wss://one.example.com")).toBe(first);
    collection.dispose();
    collection.dispose();

    expect(first.dispose).toHaveBeenCalledOnce();
    expect(second.dispose).toHaveBeenCalledOnce();
    expect(collection.size).toBe(0);
    expect(() => collection.get("wss://one.example.com")).toThrow(
      "Attempted to access a disposed resource",
    );
  });

  test("observes existing and future entries without creating any", () => {
    const collection = new RelayCommunicationCollection((url) => new FakeRelay(url));
    const first = collection.get("wss://one.example.com");
    const observed: FakeRelay[] = [];
    const complete = vi.fn();

    collection.observeEntries().subscribe({
      next: (relay) => observed.push(relay),
      complete,
    });
    expect(observed).toEqual([first]);
    expect(collection.size).toBe(1);

    const second = collection.get("wss://two.example.com");
    expect(observed).toEqual([first, second]);
    collection.dispose();
    expect(complete).toHaveBeenCalledOnce();
  });
});
