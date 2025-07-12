import "disposablestack/auto";
import { expect, test } from "vitest";
import {
  Faker,
  getTestReqOptions,
  RelayCommunicationMock,
  subscribe,
} from "../../__test__/helper/index.ts";
import { RelayMapOperator } from "../../libs/index.ts";
import { RxForwardReq } from "../../rx-req/index.ts";

import { of } from "rxjs";
import { reqForward } from "./req-forward.ts";

test(`${reqForward.name} (1)`, async () => {
  const rxReq = new RxForwardReq();
  const relayUrl = "wss://relay1.example.com";
  const relays = new RelayMapOperator((url) => new RelayCommunicationMock(url));
  const relay = relays.get(relayUrl);

  const req = reqForward({
    relays,
    rxReq,
    relayInput: ["wss://relay1.example.com"],
    config: getTestReqOptions({
      linger: 0,
      defer: false,
    }),
  });

  const sub = subscribe(req);

  relay.willRespondEvent(of(Faker.eventPacket({ id: "1" })));
  rxReq.emit([{ kinds: [0] }]);

  await expect(sub.pop()).resolves.toEqual(
    expect.objectContaining({ event: expect.objectContaining({ id: "1" }) }),
  );

  expect(sub.isComplete()).toBe(false);
});
