import { lastValueFrom, of, toArray } from "rxjs";
import { describe, expect, test } from "vitest";

import { Faker } from "../__test__/helper/faker.ts";
import type { RelayUrl } from "../libs/relay-urls.ts";
import {
  dropExpiredEvents,
  filterByType,
  latest,
  latestEach,
  sortEvents,
  tie,
  timeline,
} from "./index.ts";

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
});
