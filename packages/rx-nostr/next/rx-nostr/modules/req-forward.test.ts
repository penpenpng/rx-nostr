import "disposablestack/auto";
import { expect, test } from "vitest";
import {
  attachNextStream,
  Faker,
  getTestReqOptions,
  RelayCommunicationMock,
  subscribe,
} from "../../__test__/helper/index.ts";
import { RelayMapOperator } from "../../libs/index.ts";
import { RxForwardReq } from "../../rx-req/index.ts";

import { Expect } from "../../__test__/helper/expect.ts";
import { RxRelays } from "../../rx-relays/index.ts";
import { reqForward } from "./req-forward.ts";

test("single relay", async () => {
  const rxReq = new RxForwardReq();
  const relayUrl = "wss://relay1.example.com";
  const relays = new RelayMapOperator((url) => new RelayCommunicationMock(url));
  const relay = relays.get(relayUrl);

  const obs = reqForward({
    relays,
    rxReq,
    relayInput: ["wss://relay1.example.com"],
    config: getTestReqOptions({
      linger: 0,
      defer: false,
      weak: false,
    }),
  });

  // prewarming (defer=false)
  expect(relay.refCount).toBe(1);

  const sub = subscribe(obs);

  const stream1 = attachNextStream(relay);
  rxReq.emit([{ kinds: [0] }]);
  await stream1.ready;

  stream1.next(Faker.eventPacket({ id: "1" }));
  await sub.expectNext(Expect.eventPacket({ id: "1" }));
  stream1.next(Faker.eventPacket({ id: "2" }));
  await sub.expectNext(Expect.eventPacket({ id: "2" }));

  const stream2 = attachNextStream(relay);
  rxReq.emit([{ kinds: [1] }]);
  await stream2.ready;

  // The second subscription overrides the first one.
  // so this is expected to be ignored.
  stream1.next(Faker.eventPacket({ id: "expect-to-be-ignored" }));
  stream2.next(Faker.eventPacket({ id: "3" }));
  await sub.expectNext(Expect.eventPacket({ id: "3" }));
  stream2.next(Faker.eventPacket({ id: "4" }));
  await sub.expectNext(Expect.eventPacket({ id: "4" }));

  sub.unsubscribe();
  expect(relay.connectedCount).toBe(1);
  expect(relay.refCount).toBe(0);
});

test("single relay, defer=true", async () => {
  const rxReq = new RxForwardReq();
  const relayUrl = "wss://relay1.example.com";
  const relays = new RelayMapOperator((url) => new RelayCommunicationMock(url));
  const relay = relays.get(relayUrl);

  const obs = reqForward({
    relays,
    rxReq,
    relayInput: ["wss://relay1.example.com"],
    config: getTestReqOptions({
      linger: 0,
      defer: true,
      weak: false,
    }),
  });

  // prewarming (defer=true)
  expect(relay.refCount).toBe(0);

  const sub = subscribe(obs);

  const stream1 = attachNextStream(relay);
  rxReq.emit([{ kinds: [0] }]);
  await stream1.ready;

  // begin segment (defer=true)
  expect(relay.refCount).toBe(1);

  stream1.next(Faker.eventPacket({ id: "1" }));
  await sub.expectNext(Expect.eventPacket({ id: "1" }));

  sub.unsubscribe();
  expect(relay.connectedCount).toBe(1);
  expect(relay.refCount).toBe(0);
});

test("single relay, weak=true", async () => {
  const rxReq = new RxForwardReq();
  const relayUrl = "wss://relay1.example.com";
  const relays = new RelayMapOperator((url) => new RelayCommunicationMock(url));
  const relay = relays.get(relayUrl);

  const obs = reqForward({
    relays,
    rxReq,
    relayInput: ["wss://relay1.example.com"],
    config: getTestReqOptions({
      linger: 0,
      defer: false,
      weak: true,
    }),
  });

  // prewarming (weak=true)
  expect(relay.refCount).toBe(0);

  const sub = subscribe(obs);

  const stream1 = attachNextStream(relay);
  rxReq.emit([{ kinds: [0] }]);
  await stream1.ready;

  // begin segment (weak=true)
  expect(relay.refCount).toBe(0);

  stream1.next(Faker.eventPacket({ id: "1" }));
  await sub.expectNext(Expect.eventPacket({ id: "1" }));

  sub.unsubscribe();
  expect(relay.connectedCount).toBe(0);
  expect(relay.refCount).toBe(0);
});

test("dynamic relays", async () => {
  const rxReq = new RxForwardReq();
  const relays = new RelayMapOperator((url) => new RelayCommunicationMock(url));
  const sessionRelays = new RxRelays();

  const obs = reqForward({
    relays,
    rxReq,
    relayInput: sessionRelays,
    config: getTestReqOptions({
      linger: 0,
      defer: false,
      weak: false,
    }),
  });

  const sub = subscribe(obs);

  const relayUrl1 = "wss://relay1.example.com";
  const relay1 = relays.get(relayUrl1);
  const relayUrl2 = "wss://relay2.example.com";
  const relay2 = relays.get(relayUrl2);

  const stream1 = attachNextStream(relay1);
  expect(relay1.refCount).toBe(0);
  sessionRelays.append(relayUrl1);
  expect(relay1.refCount).toBe(1);
  expect(relay2.refCount).toBe(0);
  rxReq.emit([{ kinds: [0] }]);
  await stream1.ready;

  stream1.next(Faker.eventPacket({ id: "1" }));
  await sub.expectNext(Expect.eventPacket({ id: "1" }));

  const stream2 = attachNextStream(relay2);
  expect(relay2.refCount).toBe(0);
  sessionRelays.append(relayUrl2);
  expect(relay1.refCount).toBe(1);
  expect(relay2.refCount).toBe(1);
  await stream2.ready;

  stream2.next(Faker.eventPacket({ id: "2" }));
  await sub.expectNext(Expect.eventPacket({ id: "2" }));
  stream1.next(Faker.eventPacket({ id: "3" }));
  await sub.expectNext(Expect.eventPacket({ id: "3" }));

  const stream3 = attachNextStream(relay1);
  const stream4 = attachNextStream(relay2);
  rxReq.emit([{ kinds: [1] }]);
  await stream3.ready;
  await stream4.ready;

  stream1.next(Faker.eventPacket({ id: "expect-to-be-ignored" }));
  stream2.next(Faker.eventPacket({ id: "expect-to-be-ignored" }));
  stream3.next(Faker.eventPacket({ id: "4" }));
  await sub.expectNext(Expect.eventPacket({ id: "4" }));
  stream4.next(Faker.eventPacket({ id: "5" }));
  await sub.expectNext(Expect.eventPacket({ id: "5" }));

  sessionRelays.remove(relayUrl1);
  expect(relay1.refCount).toBe(0);

  stream3.next(Faker.eventPacket({ id: "expect-to-be-ignored" }));
  stream4.next(Faker.eventPacket({ id: "6" }));
  await sub.expectNext(Expect.eventPacket({ id: "6" }));

  sub.unsubscribe();
  expect(relay1.refCount).toBe(0);
  expect(relay2.refCount).toBe(0);
});

test("segment scope relays", async () => {
  const rxReq = new RxForwardReq();
  const relays = new RelayMapOperator((url) => new RelayCommunicationMock(url));
  const sessionRelays = new RxRelays();

  const obs = reqForward({
    relays,
    rxReq,
    relayInput: sessionRelays,
    config: getTestReqOptions({
      linger: 0,
      defer: false,
      weak: false,
    }),
  });

  const sub = subscribe(obs);

  const relayUrl1 = "wss://relay1.example.com";
  const relay1 = relays.get(relayUrl1);
  const relayUrl2 = "wss://relay2.example.com";
  const relay2 = relays.get(relayUrl2);
  const relayUrl3 = "wss://relay3.example.com";
  const relay3 = relays.get(relayUrl3);

  sessionRelays.append(relayUrl1);

  const segmentRelays = new RxRelays();
  segmentRelays.append(relayUrl2);

  const stream1 = attachNextStream(relay1);
  const stream2 = attachNextStream(relay2);
  const stream3 = attachNextStream(relay3);

  rxReq.emit({ kinds: [0] }, { relays: segmentRelays });
  await stream2.ready;

  stream1.next(Faker.eventPacket({ id: "expect-to-be-ignored" }));
  stream2.next(Faker.eventPacket({ id: "1" }));
  await sub.expectNext(Expect.eventPacket({ id: "1" }));

  segmentRelays.append(relayUrl3);
  await stream3.ready;

  stream3.next(Faker.eventPacket({ id: "2" }));
  await sub.expectNext(Expect.eventPacket({ id: "2" }));

  rxReq.emit({ kinds: [1] });
  await stream1.ready;

  stream1.next(Faker.eventPacket({ id: "3" }));
  await sub.expectNext(Expect.eventPacket({ id: "3" }));
});
