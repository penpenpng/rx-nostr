import { of } from "rxjs";

import { latestEach } from "../operator.js";
import { EventPacket } from "../packet.js";
import { fakeEventPacket } from "./stub.js";
import { asArray } from "./test-helper.js";

test("latestEach()", async () => {
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

  const packets = await asArray(packet$);

  expect(packets).toEqual([
    fakeEventPacket({
      event: { id: "1", pubkey: "a", created_at: 3, content: "latest" },
    }),
    fakeEventPacket({ event: { id: "2", pubkey: "b", created_at: 1 } }),
    fakeEventPacket({
      event: { id: "5", pubkey: "b", created_at: 3, content: "latest" },
    }),
  ]);
});
