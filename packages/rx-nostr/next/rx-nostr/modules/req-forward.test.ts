import "disposablestack/auto";
import { expect, test } from "vitest";
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

  // prewarming (defer=false)
  expect(relay.refCount).toBe(1);

  const sub = obs.subscribe();

  const stream1 = relay.attachNextStream();
  rxReq.emit([{ kinds: [0] }]);
  await stream1.subscribed;

  stream1.next(Faker.eventPacket({ id: "1" }));
  await obs.expectNext(Expect.eventPacket({ id: "1" }));
  stream1.next(Faker.eventPacket({ id: "2" }));
  await obs.expectNext(Expect.eventPacket({ id: "2" }));

  const stream2 = relay.attachNextStream();
  rxReq.emit([{ kinds: [1] }]);
  await stream2.subscribed;

  // The second subscription overrides the first one.
  // so this is expected to be ignored.
  stream1.next(Faker.eventPacket({ id: "expect-to-be-ignored" }));
  stream2.next(Faker.eventPacket({ id: "3" }));
  await obs.expectNext(Expect.eventPacket({ id: "3" }));
  stream2.next(Faker.eventPacket({ id: "4" }));
  await obs.expectNext(Expect.eventPacket({ id: "4" }));

  sub.unsubscribe();
  expect(relay.connectedCount).toBe(1);
  expect(relay.refCount).toBe(0);
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

  // prewarming (defer=true)
  expect(relay.refCount).toBe(0);

  const sub = obs.subscribe();

  const stream1 = relay.attachNextStream();
  rxReq.emit([{ kinds: [0] }]);
  await stream1.subscribed;

  // begin segment (defer=true)
  expect(relay.refCount).toBe(1);

  stream1.next(Faker.eventPacket({ id: "1" }));
  await obs.expectNext(Expect.eventPacket({ id: "1" }));

  sub.unsubscribe();
  expect(relay.connectedCount).toBe(1);
  expect(relay.refCount).toBe(0);
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

  // prewarming (weak=true)
  expect(relay.refCount).toBe(0);

  const sub = obs.subscribe();

  const stream1 = relay.attachNextStream();
  rxReq.emit([{ kinds: [0] }]);
  await stream1.subscribed;

  // begin segment (weak=true)
  expect(relay.refCount).toBe(0);

  stream1.next(Faker.eventPacket({ id: "1" }));
  await obs.expectNext(Expect.eventPacket({ id: "1" }));

  sub.unsubscribe();
  expect(relay.connectedCount).toBe(0);
  expect(relay.refCount).toBe(0);
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

  const stream1 = relay1.attachNextStream();
  expect(relay1.refCount).toBe(0);
  sessionRelays.append(relayUrl1);
  expect(relay1.refCount).toBe(1);
  expect(relay2.refCount).toBe(0);
  rxReq.emit([{ kinds: [0] }]);
  await stream1.subscribed;

  stream1.next(Faker.eventPacket({ id: "1" }));
  await obs.expectNext(Expect.eventPacket({ id: "1" }));

  const stream2 = relay2.attachNextStream();
  expect(relay2.refCount).toBe(0);
  sessionRelays.append(relayUrl2);
  expect(relay1.refCount).toBe(1);
  expect(relay2.refCount).toBe(1);
  await stream2.subscribed;

  stream2.next(Faker.eventPacket({ id: "2" }));
  await obs.expectNext(Expect.eventPacket({ id: "2" }));
  stream1.next(Faker.eventPacket({ id: "3" }));
  await obs.expectNext(Expect.eventPacket({ id: "3" }));

  const stream3 = relay1.attachNextStream();
  const stream4 = relay2.attachNextStream();
  rxReq.emit([{ kinds: [1] }]);
  await stream3.subscribed;
  await stream4.subscribed;

  stream1.next(Faker.eventPacket({ id: "expect-to-be-ignored" }));
  stream2.next(Faker.eventPacket({ id: "expect-to-be-ignored" }));
  stream3.next(Faker.eventPacket({ id: "4" }));
  await obs.expectNext(Expect.eventPacket({ id: "4" }));
  stream4.next(Faker.eventPacket({ id: "5" }));
  await obs.expectNext(Expect.eventPacket({ id: "5" }));

  sessionRelays.remove(relayUrl1);
  expect(relay1.refCount).toBe(0);

  stream3.next(Faker.eventPacket({ id: "expect-to-be-ignored" }));
  stream4.next(Faker.eventPacket({ id: "6" }));
  await obs.expectNext(Expect.eventPacket({ id: "6" }));

  sub.unsubscribe();
  expect(relay1.refCount).toBe(0);
  expect(relay2.refCount).toBe(0);
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

  rxReq.emit({ kinds: [0] }, { relays: segmentRelays });
  await stream2.subscribed;
  expect(relay1.refCount).toBe(1);
  expect(relay2.refCount).toBe(1);

  stream1.next(Faker.eventPacket({ id: "expect-to-be-ignored" }));
  stream2.next(Faker.eventPacket({ id: "1" }));
  await obs.expectNext(Expect.eventPacket({ id: "1" }));

  segmentRelays.append(relayUrl3);
  await stream3.subscribed;
  expect(relay3.refCount).toBe(1);

  stream3.next(Faker.eventPacket({ id: "2" }));
  await obs.expectNext(Expect.eventPacket({ id: "2" }));

  rxReq.emit({ kinds: [1] });
  await stream1.subscribed;

  stream1.next(Faker.eventPacket({ id: "3" }));
  await obs.expectNext(Expect.eventPacket({ id: "3" }));

  sub.unsubscribe();
});
