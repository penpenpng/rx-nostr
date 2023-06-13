import { of } from "rxjs";

import { latestEach } from "../operator.js";
import { EventPacket } from "../packet.js";
import { fakeEventPacket } from "./stub.js";
import { testScheduler } from "./test-helper.js";

test("latestEach()", async () => {
  testScheduler().run((helpers) => {
    const { expectObservable } = helpers;

    const packet$ = of<EventPacket[]>(
      fakeEventPacket({
        event: { id: "1", pubkey: "a", created_at: 3, content: "latest" },
      }),
      fakeEventPacket({ event: { id: "2", pubkey: "b", created_at: 1 } }),
      fakeEventPacket({ event: { id: "3", pubkey: "a", created_at: 2 } }),
      fakeEventPacket({ event: { id: "4", pubkey: "a", created_at: 1 } }),
      fakeEventPacket({
        event: { id: "5", pubkey: "b", created_at: 3, content: "latest" },
      }),
      fakeEventPacket({ event: { id: "6", pubkey: "b", created_at: 2 } })
    ).pipe(latestEach((packet) => packet.event.pubkey));

    expectObservable(packet$).toEqual(
      of(
        fakeEventPacket({
          event: { id: "1", pubkey: "a", created_at: 3, content: "latest" },
        }),
        fakeEventPacket({ event: { id: "2", pubkey: "b", created_at: 1 } }),
        fakeEventPacket({
          event: { id: "5", pubkey: "b", created_at: 3, content: "latest" },
        })
      )
    );
  });
});
