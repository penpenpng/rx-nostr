import { map, of } from "rxjs";
import { test } from "vitest";

import { latestEach } from "../operator";
import { EventPacket } from "../packet";
import { faker, testScheduler } from "./helper";

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
