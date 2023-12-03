import { map, of } from "rxjs";
import { test } from "vitest";

import { dropExpiredEvents, filterType, latestEach } from "../operator.js";
import { EventPacket, MessagePacket } from "../packet.js";
import { faker, testScheduler } from "./helper.js";

test("latestEach()", async () => {
  testScheduler().run((helpers) => {
    const { expectObservable } = helpers;

    const packet$ = of<EventPacket[]>(
      faker.eventPacket({ id: "1", pubkey: "a", created_at: 3 }),
      faker.eventPacket({ id: "2", pubkey: "b", created_at: 1 }),
      faker.eventPacket({ id: "3", pubkey: "a", created_at: 2 }),
      faker.eventPacket({ id: "4", pubkey: "a", created_at: 1 }),
      faker.eventPacket({ id: "5", pubkey: "b", created_at: 3 }),
      faker.eventPacket({ id: "6", pubkey: "b", created_at: 2 })
    ).pipe(latestEach((packet) => packet.event.pubkey));

    expectObservable(packet$.pipe(map((e) => e.event.id))).toEqual(
      of("1", "2", "5")
    );
  });
});

test("filterType()", async () => {
  testScheduler().run((helpers) => {
    const { expectObservable } = helpers;

    const packets: MessagePacket[] = [
      faker.messagePacket(faker.toClientMessage.NOTICE("Hello")),
      faker.messagePacket(faker.toClientMessage.EVENT("*")),
      faker.messagePacket(faker.toClientMessage.AUTH()),
      faker.messagePacket(faker.toClientMessage.NOTICE("Nostr")),
      faker.messagePacket(faker.toClientMessage.COUNT("*")),
      faker.messagePacket(faker.toClientMessage.EVENT("*")),
    ];

    const packet$ = of(...packets).pipe(filterType("NOTICE"));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expectObservable(packet$).toEqual(of<any[]>(packets[0], packets[3]));
  });
});

test("dropExpiredEvents()", async () => {
  testScheduler().run((helpers) => {
    const { expectObservable } = helpers;

    const packets: EventPacket[] = [
      faker.eventPacket({ id: "1", tags: [["expiration", "1000"]] }),
      faker.eventPacket({ id: "1", tags: [["expiration", "2000"]] }),
      faker.eventPacket({ id: "1", tags: [["expiration", "3001"]] }),
      faker.eventPacket({ id: "1", tags: [["expiration", "2000"]] }),
      faker.eventPacket({ id: "1", tags: [["expiration", "10000"]] }),
    ];

    const packet$ = of(...packets).pipe(
      dropExpiredEvents(new Date(3000 * 1000))
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expectObservable(packet$).toEqual(of<any[]>(packets[2], packets[4]));
  });
});
