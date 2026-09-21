import { EMPTY } from "rxjs";
import { describe, expect, test, vi } from "vitest";
import type { LazyFilter } from "../lazy-filter/index.ts";
import type { EventPacket, OkPacket } from "../packets/index.ts";
import type * as Nostr from "nostr-typedef";
import { RelayPool } from "./relay-pool.ts";

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

describe("RelayPool", () => {
  test("owns one entry for every normalized URL alias", () => {
    const factory = vi.fn((url) => new FakeRelay(url));
    const pool = new RelayPool(factory);

    const first = pool.get("wss://RELAY.example.com/" as const);
    const second = pool.get("wss://relay.example.com" as const);

    expect(second).toBe(first);
    expect(first.url).toBe("wss://relay.example.com");
    expect(factory).toHaveBeenCalledOnce();
    expect(pool.size).toBe(1);
  });

  test("keeps idle entries until pool disposal and disposes each once", () => {
    const pool = new RelayPool((url) => new FakeRelay(url));
    const first = pool.get("wss://one.example.com");
    const second = pool.get("wss://two.example.com");

    expect(pool.get("wss://one.example.com")).toBe(first);
    pool.dispose();
    pool.dispose();

    expect(first.dispose).toHaveBeenCalledOnce();
    expect(second.dispose).toHaveBeenCalledOnce();
    expect(pool.size).toBe(0);
    expect(() => pool.get("wss://one.example.com")).toThrow(
      "Attempted to access a disposed resource",
    );
  });

  test("observes existing and future entries without creating any", () => {
    const pool = new RelayPool((url) => new FakeRelay(url));
    const first = pool.get("wss://one.example.com");
    const observed: FakeRelay[] = [];
    const complete = vi.fn();

    pool.observeEntries().subscribe({
      next: (relay) => observed.push(relay),
      complete,
    });
    expect(observed).toEqual([first]);
    expect(pool.size).toBe(1);

    const second = pool.get("wss://two.example.com");
    expect(observed).toEqual([first, second]);
    pool.dispose();
    expect(complete).toHaveBeenCalledOnce();
  });
});
