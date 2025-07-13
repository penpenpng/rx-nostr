import "disposablestack/auto";
import { assert, expect, test } from "vitest";
import {
  Faker,
  getTestReqOptions,
  ObservableInspector,
  RelayCommunicationMock,
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

  const obs = new ObservableInspector(
    reqForward({
      relays,
      rxReq,
      relayInput: ["wss://relay1.example.com"],
      config: getTestReqOptions({
        linger: 0,
        defer: false,
        weak: false,
      }),
    }),
  );

  assert(relay.latch.isLatched, "Relay should be prewarmed (defer=false)");

  const sub = obs.subscribe();

  const req1 = relay.attachNextStream();
  rxReq.emit([{ kinds: [1] }]);
  await req1.subscribed;

  req1.next(Faker.eventPacket({ id: "1" }));
  await obs.expectNext(Expect.eventPacket({ id: "1" }));
  req1.next(Faker.eventPacket({ id: "2" }));
  await obs.expectNext(Expect.eventPacket({ id: "2" }));

  const req2 = relay.attachNextStream();
  rxReq.emit([{ kinds: [2] }]);
  await req2.subscribed;

  // The second subscription overrides the first one.
  // so this is expected to be ignored.
  req1.next(Faker.eventPacket({ id: "expect-to-be-ignored" }));
  req2.next(Faker.eventPacket({ id: "3" }));
  await obs.expectNext(Expect.eventPacket({ id: "3" }));
  req2.next(Faker.eventPacket({ id: "4" }));
  await obs.expectNext(Expect.eventPacket({ id: "4" }));

  sub.unsubscribe();
  assert(!relay.latch.isLatched, "Relay should be released");
});

test("single relay, defer=true", async () => {
  const rxReq = new RxForwardReq();
  const relayUrl = "wss://relay1.example.com";
  const relays = new RelayMapOperator((url) => new RelayCommunicationMock(url));
  const relay = relays.get(relayUrl);

  const obs = new ObservableInspector(
    reqForward({
      relays,
      rxReq,
      relayInput: ["wss://relay1.example.com"],
      config: getTestReqOptions({
        linger: 0,
        defer: true,
        weak: false,
      }),
    }),
  );

  assert(!relay.latch.isLatched, "Relay should not be prewarmed (defer=true)");

  const sub = obs.subscribe();

  const req1 = relay.attachNextStream();
  rxReq.emit([{ kinds: [1] }]);
  await req1.subscribed;

  assert(
    relay.latch.isLatched,
    "Relay should be warmed up just before a segment (defer=true)",
  );

  req1.next(Faker.eventPacket({ id: "1" }));
  await obs.expectNext(Expect.eventPacket({ id: "1" }));

  sub.unsubscribe();
  expect(relay.latchedCount).toBe(1);
  assert(!relay.latch.isLatched, "Relay should be released");
});

test("single relay, weak=true", async () => {
  const rxReq = new RxForwardReq();
  const relayUrl = "wss://relay1.example.com";
  const relays = new RelayMapOperator((url) => new RelayCommunicationMock(url));
  const relay = relays.get(relayUrl);

  const obs = new ObservableInspector(
    reqForward({
      relays,
      rxReq,
      relayInput: ["wss://relay1.example.com"],
      config: getTestReqOptions({
        linger: 0,
        defer: false,
        weak: true,
      }),
    }),
  );

  assert(!relay.latch.isLatched, "Relay should not be held (weak=true)");

  const sub = obs.subscribe();

  const req1 = relay.attachNextStream();
  rxReq.emit([{ kinds: [1] }]);
  await req1.subscribed;

  assert(!relay.latch.isLatched, "Relay should not be held (weak=true)");

  req1.next(Faker.eventPacket({ id: "expect-to-be-ignored" }));
  relay.isHot = true;
  req1.next(Faker.eventPacket({ id: "1" }));
  await obs.expectNext(Expect.eventPacket({ id: "1" }));

  sub.unsubscribe();
  expect(relay.latchedCount).toBe(0);
  assert(!relay.latch.isLatched, "Relay should be released");
});

test("dynamic relays", async () => {
  const rxReq = new RxForwardReq();
  const relays = new RelayMapOperator((url) => new RelayCommunicationMock(url));
  const sessionRelays = new RxRelays();

  const obs = new ObservableInspector(
    reqForward({
      relays,
      rxReq,
      relayInput: sessionRelays,
      config: getTestReqOptions({
        linger: 0,
        defer: false,
        weak: false,
      }),
    }),
  );

  const sub = obs.subscribe();

  const relayUrl1 = "wss://relay1.example.com";
  const relay1 = relays.get(relayUrl1);
  const relayUrl2 = "wss://relay2.example.com";
  const relay2 = relays.get(relayUrl2);

  const req1relay1 = relay1.attachNextStream();
  expect(relay1.latch.isLatched).toBe(false);
  sessionRelays.append(relayUrl1);
  expect(relay1.latch.isLatched).toBe(true);
  expect(relay2.latch.isLatched).toBe(false);
  rxReq.emit([{ kinds: [1] }]);
  await req1relay1.subscribed;

  req1relay1.next(Faker.eventPacket({ id: "1" }));
  await obs.expectNext(Expect.eventPacket({ id: "1" }));

  const req1relay2 = relay2.attachNextStream();
  expect(relay2.latch.isLatched).toBe(false);
  sessionRelays.append(relayUrl2);
  expect(relay1.latch.isLatched).toBe(true);
  expect(relay2.latch.isLatched).toBe(true);
  await req1relay2.subscribed;

  req1relay2.next(Faker.eventPacket({ id: "2" }));
  await obs.expectNext(Expect.eventPacket({ id: "2" }));
  req1relay1.next(Faker.eventPacket({ id: "3" }));
  await obs.expectNext(Expect.eventPacket({ id: "3" }));

  const req2relay1 = relay1.attachNextStream();
  const req2relay2 = relay2.attachNextStream();
  rxReq.emit([{ kinds: [2] }]);
  await req2relay1.subscribed;
  await req2relay2.subscribed;

  req1relay1.next(Faker.eventPacket({ id: "expect-to-be-ignored" }));
  req1relay2.next(Faker.eventPacket({ id: "expect-to-be-ignored" }));
  req2relay1.next(Faker.eventPacket({ id: "4" }));
  await obs.expectNext(Expect.eventPacket({ id: "4" }));
  req2relay2.next(Faker.eventPacket({ id: "5" }));
  await obs.expectNext(Expect.eventPacket({ id: "5" }));

  sessionRelays.remove(relayUrl1);
  expect(relay1.latch.isLatched).toBe(false);

  req2relay1.next(Faker.eventPacket({ id: "expect-to-be-ignored" }));
  req2relay2.next(Faker.eventPacket({ id: "6" }));
  await obs.expectNext(Expect.eventPacket({ id: "6" }));

  sub.unsubscribe();
  expect(relay1.latch.isLatched).toBe(false);
  expect(relay2.latch.isLatched).toBe(false);
});

test("segment scope relays", async () => {
  const rxReq = new RxForwardReq();
  const relays = new RelayMapOperator((url) => new RelayCommunicationMock(url));
  const sessionRelays = new RxRelays();

  const obs = new ObservableInspector(
    reqForward({
      relays,
      rxReq,
      relayInput: sessionRelays,
      config: getTestReqOptions({
        linger: 0,
        defer: false,
        weak: false,
      }),
    }),
  );

  const sub = obs.subscribe();

  const relayUrl1 = "wss://relay1.example.com";
  const relay1 = relays.get(relayUrl1);
  const relayUrl2 = "wss://relay2.example.com";
  const relay2 = relays.get(relayUrl2);
  const relayUrl3 = "wss://relay3.example.com";
  const relay3 = relays.get(relayUrl3);

  sessionRelays.append(relayUrl1);

  const segmentRelays = new RxRelays();
  segmentRelays.append(relayUrl2);

  const stream1 = relay1.attachNextStream();
  const stream2 = relay2.attachNextStream();
  const stream3 = relay3.attachNextStream();

  rxReq.emit({ kinds: [1] }, { relays: segmentRelays });
  await stream2.subscribed;
  expect(relay1.latch.isLatched).toBe(true);
  expect(relay2.latch.isLatched).toBe(true);

  stream1.next(Faker.eventPacket({ id: "expect-to-be-ignored" }));
  stream2.next(Faker.eventPacket({ id: "1" }));
  await obs.expectNext(Expect.eventPacket({ id: "1" }));

  segmentRelays.append(relayUrl3);
  await stream3.subscribed;
  expect(relay3.latch.isLatched).toBe(true);

  stream3.next(Faker.eventPacket({ id: "2" }));
  await obs.expectNext(Expect.eventPacket({ id: "2" }));

  rxReq.emit({ kinds: [2] });
  await stream1.subscribed;

  stream1.next(Faker.eventPacket({ id: "3" }));
  await obs.expectNext(Expect.eventPacket({ id: "3" }));

  sub.unsubscribe();
});
