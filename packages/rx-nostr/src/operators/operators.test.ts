import { lastValueFrom, of, Subject, throwError, TimeoutError, toArray } from "rxjs";
import { describe, expect, test, vi } from "vitest";

import { Faker } from "../__test__/helper/faker.ts";
import { createDeferred } from "../__test__/helper/index.ts";
import type { RelayUrl } from "../libs/relay-urls.ts";
import type { ReqPacket } from "../packets/index.ts";
import { RxRelays } from "../rx-relays/index.ts";
import {
  batch,
  chunk,
  createTie,
  createUniq,
  dropExpiredEvents,
  filterAsync,
  filterByType,
  latest,
  latestEach,
  setDiff,
  sortEvents,
  tie,
  timeline,
  timeoutWith,
  uniq,
} from "./index.ts";

function* oneShotRelay() {
  yield "wss://a.example.com";
}

describe("operators", () => {
  test.each(["small-first", "large-first"] as const)(
    "orders same-timestamp events consistently when %s",
    async (arrival) => {
      const small = Faker.eventPacket({ id: "a", pubkey: "same", created_at: 2 });
      const large = Faker.eventPacket({ id: "b", pubkey: "same", created_at: 2 });
      const older = Faker.eventPacket({ id: "z", pubkey: "other", created_at: 1 });
      const packets = arrival === "small-first" ? [older, small, large] : [older, large, small];

      const newest = await lastValueFrom(of(...packets).pipe(latest(), toArray()));
      const byKey = await lastValueFrom(
        of(...packets).pipe(
          latestEach((packet) => packet.event.pubkey),
          toArray(),
        ),
      );
      const timelineResult = await lastValueFrom(of(...packets).pipe(timeline()));
      const ascending = await lastValueFrom(of(...packets).pipe(sortEvents(0), toArray()));

      expect(newest.at(-1)?.event.id).toBe("a");
      expect(byKey.filter(({ event }) => event.pubkey === "same").at(-1)?.event.id).toBe("a");
      expect(timelineResult.map(({ event }) => event.id)).toEqual(["a", "b", "z"]);
      expect(ascending.map(({ event }) => event.id)).toEqual(["z", "b", "a"]);
    },
  );

  test("latestEach emits only newer events for each key", async () => {
    const packets = [
      Faker.eventPacket({ id: "1", pubkey: "a", created_at: 3 }),
      Faker.eventPacket({ id: "2", pubkey: "b", created_at: 1 }),
      Faker.eventPacket({ id: "3", pubkey: "a", created_at: 2 }),
      Faker.eventPacket({ id: "4", pubkey: "a", created_at: 1 }),
      Faker.eventPacket({ id: "5", pubkey: "b", created_at: 3 }),
      Faker.eventPacket({ id: "6", pubkey: "b", created_at: 2 }),
    ];

    const actual = await lastValueFrom(
      of(...packets).pipe(
        latestEach((packet) => packet.event.pubkey),
        toArray(),
      ),
    );

    expect(actual.map(({ event }) => event.id)).toEqual(["1", "2", "5"]);
  });

  test("filterByType narrows and filters packet types", async () => {
    const packets = [
      { type: "NOTICE", notice: "Hello" },
      { type: "EVENT", event: "first" },
      { type: "AUTH", challenge: "challenge" },
      { type: "NOTICE", notice: "Nostr" },
    ];

    const actual = await lastValueFrom(of(...packets).pipe(filterByType("NOTICE"), toArray()));

    expect(actual).toEqual([packets[0], packets[3]]);
  });

  test("dropExpiredEvents applies the NIP-40 expiration boundary", async () => {
    const packets = [
      Faker.eventPacket({ id: "1", tags: [["expiration", "1000"]] }),
      Faker.eventPacket({ id: "2", tags: [["expiration", "2000"]] }),
      Faker.eventPacket({ id: "3", tags: [["expiration", "3001"]] }),
      Faker.eventPacket({ id: "4", tags: [["expiration", "10000"]] }),
    ];

    const actual = await lastValueFrom(
      of(...packets).pipe(dropExpiredEvents(new Date(3_000_000)), toArray()),
    );

    expect(actual).toEqual([packets[2], packets[3]]);
  });

  test("tie drops duplicate relay sightings and accumulates origins", async () => {
    const relayA = "wss://aaa.example.com" as RelayUrl;
    const relayB = "wss://bbb.example.com" as RelayUrl;
    const relayC = "wss://ccc.example.com" as RelayUrl;
    const packets = [
      Faker.eventPacket({ id: "1", from: relayA }),
      Faker.eventPacket({ id: "1", from: relayA }),
      Faker.eventPacket({ id: "2", from: relayA }),
      Faker.eventPacket({ id: "1", from: relayB }),
      Faker.eventPacket({ id: "2", from: relayB }),
      Faker.eventPacket({ id: "1", from: relayC }),
    ];

    const actual = await lastValueFrom(of(...packets).pipe(tie(), toArray()));

    expect(
      actual.map(({ event, seenOn, isNew }) => ({
        id: event.id,
        seenOn: [...seenOn].toSorted(),
        isNew,
      })),
    ).toEqual([
      { id: "1", seenOn: [relayA], isNew: true },
      { id: "2", seenOn: [relayA], isNew: true },
      { id: "1", seenOn: [relayA, relayB], isNew: false },
      { id: "2", seenOn: [relayA, relayB], isNew: false },
      { id: "1", seenOn: [relayA, relayB, relayC], isNew: false },
    ]);
  });

  test("timeline keeps only the newest entry for limit 1 and emits empty snapshots for limit 0", async () => {
    const packets = [
      Faker.eventPacket({ id: "z", created_at: 1 }),
      Faker.eventPacket({ id: "b", created_at: 2 }),
      Faker.eventPacket({ id: "a", created_at: 2 }),
    ];
    const one = await lastValueFrom(of(...packets).pipe(timeline(1), toArray()));
    const zero = await lastValueFrom(of(...packets).pipe(timeline(0), toArray()));

    expect(one.map(([packet]) => packet?.event.id)).toEqual(["z", "b", "a"]);
    expect(zero).toEqual([[], [], []]);
  });

  test.each([-1, 1.5, NaN, Infinity])("rejects an invalid timeline limit %s", (limit) => {
    expect(() => timeline(limit)).toThrow(RangeError);
  });

  test("sortEvents flushes buffered events in event order after the configured delay", async () => {
    vi.useFakeTimers();
    const source = new Subject<ReturnType<typeof Faker.eventPacket>>();
    const seen: string[] = [];
    const subscription = source.pipe(sortEvents(20)).subscribe((packet) => {
      seen.push(packet.event.id);
    });

    try {
      source.next(Faker.eventPacket({ id: "a", created_at: 2 }));
      source.next(Faker.eventPacket({ id: "z", created_at: 1 }));
      source.next(Faker.eventPacket({ id: "b", created_at: 2 }));
      source.complete();

      await vi.advanceTimersByTimeAsync(19);
      expect(seen).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      expect(seen).toEqual(["z", "b", "a"]);
    } finally {
      subscription.unsubscribe();
      vi.useRealTimers();
    }
  });

  describe("ReqPacket operators", () => {
    test("batch groups equivalent fixed relays and keeps the first packet's options", async () => {
      const first: ReqPacket = {
        relays: ["wss://a.example.com/"],
        filters: [{ kinds: [1] }],
        traceTag: "first",
        linger: 1,
      };
      const conflicting: ReqPacket = {
        relays: ["wss://a.example.com"],
        filters: [{ kinds: [2] }],
        traceTag: "second",
        linger: 2,
      };
      const other: ReqPacket = { relays: ["wss://b.example.com"], filters: [{ kinds: [3] }] };
      const result = await lastValueFrom(of([first, other, conflicting]).pipe(batch(), toArray()));

      expect(result).toEqual([{ ...first, filters: [{ kinds: [1] }, { kinds: [2] }] }, other]);
      expect(result[0]?.relays).toEqual(first.relays);
    });

    test("batch preserves a one-shot relay iterable for the output packet", async () => {
      const input: ReqPacket = { relays: oneShotRelay(), filters: [{ kinds: [1] }] };
      const result = await lastValueFrom(of([input]).pipe(batch(), toArray()));

      expect([...RxRelays.set(result[0]?.relays)]).toEqual(["wss://a.example.com"]);
    });

    test("batch keeps separate RxRelays instances separate even with equal URLs", async () => {
      using firstRelays = new RxRelays(["wss://a.example.com"]);
      using secondRelays = new RxRelays(["wss://a.example.com"]);
      const first: ReqPacket = { relays: firstRelays, filters: [{ kinds: [1] }] };
      const repeated: ReqPacket = { relays: firstRelays, filters: [{ kinds: [2] }] };
      const distinct: ReqPacket = { relays: secondRelays, filters: [{ kinds: [3] }] };
      const result = await lastValueFrom(of([first, distinct, repeated]).pipe(batch(), toArray()));

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ filters: [{ kinds: [1] }, { kinds: [2] }] });
      expect(result[0]?.relays).toBe(firstRelays);
      expect(result[1]?.relays).toBe(secondRelays);
    });

    test("batch omits empty input and calls a custom filter merge in input order", async () => {
      const merge = vi.fn((left: ReqPacket["filters"], right: ReqPacket["filters"]) => [
        ...right,
        ...left,
      ]);
      const first: ReqPacket = { filters: [{ kinds: [1] }] };
      const second: ReqPacket = { filters: [{ kinds: [2] }] };
      const empty = await lastValueFrom(of([] as ReqPacket[]).pipe(batch(), toArray()));
      const merged = await lastValueFrom(of([first, second]).pipe(batch(merge), toArray()));

      expect(empty).toEqual([]);
      expect(merged).toEqual([{ filters: [{ kinds: [2] }, { kinds: [1] }] }]);
      expect(merge).toHaveBeenCalledTimes(2);
    });

    test("chunk keeps options on each split packet and emits nothing for an empty split", async () => {
      using relays = new RxRelays(["wss://a.example.com"]);
      const packet: ReqPacket = {
        relays,
        filters: [{ kinds: [1] }, { kinds: [2] }],
        traceTag: "chunk",
        linger: 0,
      };
      const split = chunk(
        (filters) => filters.length > 1,
        (filters) => filters.map((filter) => [filter]),
      );
      const result = await lastValueFrom(of(packet).pipe(split, toArray()));
      const unchanged = await lastValueFrom(
        of(packet).pipe(
          chunk(
            () => false,
            () => [],
          ),
          toArray(),
        ),
      );
      const empty = await lastValueFrom(
        of(packet).pipe(
          chunk(
            () => true,
            () => [],
          ),
          toArray(),
        ),
      );

      expect(result).toEqual([
        { ...packet, filters: [{ kinds: [1] }] },
        { ...packet, filters: [{ kinds: [2] }] },
      ]);
      expect(result.every((item) => item.relays === relays)).toBe(true);
      expect(unchanged).toEqual([packet]);
      expect(unchanged[0]).toBe(packet);
      expect(empty).toEqual([]);
    });

    test.each(["predicate", "split"] as const)("chunk forwards a %s exception", async (where) => {
      const cause = new Error(`${where} failed`);
      const operator =
        where === "predicate"
          ? chunk(
              () => {
                throw cause;
              },
              () => [],
            )
          : chunk(
              () => true,
              () => {
                throw cause;
              },
            );

      await expect(
        lastValueFrom(of({ filters: [{}] } as ReqPacket).pipe(operator, toArray())),
      ).rejects.toBe(cause);
    });
  });

  describe("operator state", () => {
    test.each([0, false, ""])(
      "timeoutWith emits an explicitly configured falsy fallback %s",
      async (fallback) => {
        const result = await lastValueFrom(
          throwError(() => new TimeoutError()).pipe(timeoutWith(fallback), toArray()),
        );

        expect(result).toEqual([fallback]);
      },
    );

    test("uniq starts a fresh cache for each subscription, while createUniq shares its cache", async () => {
      const packet = Faker.eventPacket({ id: "same" });
      const reusableUniq = uniq();
      const [sharedUniq, cache] = createUniq((value: typeof packet) => value.event.id);
      const first = await lastValueFrom(of(packet).pipe(reusableUniq, toArray()));
      const second = await lastValueFrom(of(packet).pipe(reusableUniq, toArray()));
      const sharedFirst = await lastValueFrom(of(packet).pipe(sharedUniq, toArray()));
      const sharedSecond = await lastValueFrom(of(packet).pipe(sharedUniq, toArray()));

      expect(first).toEqual([packet]);
      expect(second).toEqual([packet]);
      expect(sharedFirst).toEqual([packet]);
      expect(sharedSecond).toEqual([]);
      expect(cache).toEqual(new Set(["same"]));

      cache.clear();
      expect(await lastValueFrom(of(packet).pipe(sharedUniq, toArray()))).toEqual([packet]);
    });

    test("setDiff snapshots inputs and isolates state across subscribers", () => {
      const seed = new Set([0]);
      const source = new Subject<Set<number>>();
      const operator = setDiff<number>({ seed });
      const first: Array<{ appended?: Set<number>; outdated?: Set<number>; current: Set<number> }> =
        [];
      const second: Array<{
        appended?: Set<number>;
        outdated?: Set<number>;
        current: Set<number>;
      }> = [];
      const firstSubscription = source.pipe(operator).subscribe((change) => {
        first.push(change);
        change.current.clear();
      });
      const secondSubscription = source.pipe(operator).subscribe((change) => second.push(change));
      const input = new Set([1]);

      source.next(input);
      input.clear();
      seed.clear();
      source.next(new Set([1, 2]));

      expect(first[0]?.appended).toEqual(new Set([1]));
      expect(first[0]?.outdated).toEqual(new Set([0]));
      expect(second[0]?.current).toEqual(new Set([1]));
      expect(second[1]?.appended).toEqual(new Set([2]));
      expect(second[1]?.outdated).toEqual(new Set());
      firstSubscription.unsubscribe();
      secondSubscription.unsubscribe();
    });

    test("createTie shares its memo but snapshots seenOn for each emitted packet", async () => {
      const firstRelay = "wss://first.example.com" as RelayUrl;
      const secondRelay = "wss://second.example.com" as RelayUrl;
      const thirdRelay = "wss://third.example.com" as RelayUrl;
      const [sharedTie, memo] = createTie<ReturnType<typeof Faker.eventPacket>>();
      const first = Faker.eventPacket({ id: "same", from: firstRelay });
      const second = Faker.eventPacket({ id: "same", from: secondRelay });
      const third = Faker.eventPacket({ id: "same", from: thirdRelay });
      const initial = await lastValueFrom(of(first, second).pipe(sharedTie, toArray()));
      const later = await lastValueFrom(of(third).pipe(sharedTie, toArray()));

      expect(initial[0]?.seenOn).toEqual(new Set([firstRelay]));
      expect(initial[1]?.seenOn).toEqual(new Set([firstRelay, secondRelay]));
      expect(later[0]?.seenOn).toEqual(new Set([firstRelay, secondRelay, thirdRelay]));
      expect(later[0]?.isNew).toBe(false);

      initial[0]?.seenOn.clear();
      expect(memo.get("same")).toEqual(new Set([firstRelay, secondRelay, thirdRelay]));
    });

    test("filterAsync completes after pending predicates and emits in resolution order", async () => {
      const first = createDeferred<boolean>();
      const second = createDeferred<boolean>();
      const source = new Subject<number>();
      const seen: number[] = [];
      let completed = false;
      const subscription = source
        .pipe(filterAsync((value) => (value === 1 ? first.promise : second.promise)))
        .subscribe({
          next: (value) => seen.push(value),
          complete: () => {
            completed = true;
          },
        });

      source.next(1);
      source.next(2);
      source.complete();
      second.resolve(true);
      await Promise.resolve();
      await Promise.resolve();
      expect(seen).toEqual([2]);
      expect(completed).toBe(false);

      first.resolve(true);
      await Promise.resolve();
      await Promise.resolve();
      expect(seen).toEqual([2, 1]);
      expect(completed).toBe(true);
      subscription.unsubscribe();
    });

    test("filterAsync does not emit after unsubscribe while a predicate is pending", async () => {
      const pending = createDeferred<boolean>();
      const source = new Subject<number>();
      const seen: number[] = [];
      const subscription = source.pipe(filterAsync(() => pending.promise)).subscribe((value) => {
        seen.push(value);
      });

      source.next(1);
      subscription.unsubscribe();
      pending.resolve(true);
      await Promise.resolve();
      await Promise.resolve();
      expect(seen).toEqual([]);
    });
  });
});
