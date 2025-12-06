import "disposablestack/auto";
import { assert, test } from "vitest";
import {
  Faker,
  getTestReqOptions,
  ObservableInspector,
  RelayCommunicationMock,
} from "../../__test__/helper/index.ts";
import { RelayMapOperator } from "../../libs/index.ts";
import { RxBackwardReq } from "../../rx-req/index.ts";

import { Expect } from "../../__test__/helper/expect.ts";
import { RxRelays } from "../../rx-relays/index.ts";
import { reqBackward } from "./req-backward.ts";

test("single relay", async () => {
  const rxReq = new RxBackwardReq();
  const relayUrl = "wss://relay1.example.com";
  const relays = new RelayMapOperator((url) => new RelayCommunicationMock(url));
  const relay = relays.get(relayUrl);

  const obs = new ObservableInspector(
    reqBackward({
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

  assert(relay.latch.isHeld, "Relay should be prewarmed (defer=false)");

  const sub = obs.subscribe();

  const req1 = relay.attachNextStream();
  rxReq.emit([{ kinds: [1] }], { traceTag: 1 });
  await relay.expectFilters([{ kinds: [1] }]);
  await req1.subscribed;

  req1.next(Faker.eventPacket({ id: "1" }));
  await obs.expectNext(Expect.eventPacket({ id: "1" }));
  req1.next(Faker.eventPacket({ id: "2" }));
  await obs.expectNext(Expect.eventPacket({ id: "2" }));

  const req2 = relay.attachNextStream();
  rxReq.emit([{ kinds: [2] }], { traceTag: 2 });
  await relay.expectFilters([{ kinds: [2] }]);
  await req2.subscribed;

  // The first subscription is still active.
  req1.next(Faker.eventPacket({ id: "3" }));
  await obs.expectNext(Expect.eventPacket({ id: "3" }));
  req2.next(Faker.eventPacket({ id: "4" }));
  await obs.expectNext(Expect.eventPacket({ id: "4" }));

  req1.complete();
  req2.next(Faker.eventPacket({ id: "5" }));
  await obs.expectNext(Expect.eventPacket({ id: "5" }));

  req2.complete();
  assert(!relay.latch.isHeld, "Relay should be released");

  const req3 = relay.attachNextStream();
  rxReq.emit([{ kinds: [3] }], { traceTag: 3 });
  await relay.expectFilters([{ kinds: [3] }]);
  await req3.subscribed;
  assert(relay.latch.isHeld, "Relay should be reconnected");

  req3.next(Faker.eventPacket({ id: "6" }));
  await obs.expectNext(Expect.eventPacket({ id: "6" }));

  req3.complete();
  rxReq.over();

  await obs.expectComplete();
  sub.unsubscribe();

  assert(relay.latchedCount === 2);
});

test("single relay, defer=true", async () => {
  const rxReq = new RxBackwardReq();
  const relayUrl = "wss://relay1.example.com";
  const relays = new RelayMapOperator((url) => new RelayCommunicationMock(url));
  const relay = relays.get(relayUrl);

  const obs = new ObservableInspector(
    reqBackward({
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

  assert(!relay.latch.isHeld, "Relay should not be prewarmed (defer=true)");

  const sub = obs.subscribe();

  const req1 = relay.attachNextStream();
  rxReq.emit([{ kinds: [1] }], { traceTag: 1 });
  await relay.expectFilters([{ kinds: [1] }]);
  await req1.subscribed;

  assert(
    relay.latch.isHeld,
    "Relay should be connected just before a segment (defer=true)",
  );

  req1.next(Faker.eventPacket({ id: "1" }));
  await obs.expectNext(Expect.eventPacket({ id: "1" }));

  const req2 = relay.attachNextStream();
  rxReq.emit([{ kinds: [2] }], { traceTag: 2 });
  await relay.expectFilters([{ kinds: [2] }]);
  await req2.subscribed;

  // The first subscription is still active.
  req1.next(Faker.eventPacket({ id: "2" }));
  await obs.expectNext(Expect.eventPacket({ id: "2" }));
  req2.next(Faker.eventPacket({ id: "3" }));
  await obs.expectNext(Expect.eventPacket({ id: "3" }));

  sub.unsubscribe();
  assert(
    relay.latchedCount === 1,
    "Only one attempt should be made to connect to the relay",
  );
  assert(!relay.latch.isHeld, "Relay should be released");
});

test("single relay, weak=true", async () => {
  const rxReq = new RxBackwardReq();
  const relayUrl = "wss://relay1.example.com";
  const relays = new RelayMapOperator((url) => new RelayCommunicationMock(url));
  const relay = relays.get(relayUrl);

  const obs = new ObservableInspector(
    reqBackward({
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

  assert(!relay.latch.isHeld, "Relay should not be prewarmed (weak=true)");

  const sub = obs.subscribe();

  const stream1 = relay.attachNextStream();
  rxReq.emit([{ kinds: [0] }]);
  await relay.expectFilters([{ kinds: [0] }]);
  await stream1.subscribed;

  assert(
    !relay.latch.isHeld,
    "Relay should keep to be disconnected (weak=true)",
  );

  stream1.next(Faker.eventPacket({ id: "expect-to-be-ignored" }));
  relay.isHot = true;
  stream1.next(Faker.eventPacket({ id: "1" }));
  await obs.expectNext(Expect.eventPacket({ id: "1" }));

  sub.unsubscribe();
  assert(
    relay.latchedCount === 0,
    "No connection attempts should be made (weak=true)",
  );
  assert(!relay.latch.isHeld, "Relay should be released");
});

test("dynamic relays", async () => {
  const rxReq = new RxBackwardReq();
  const relays = new RelayMapOperator((url) => new RelayCommunicationMock(url));
  const sessionRelays = new RxRelays();

  const obs = new ObservableInspector(
    reqBackward({
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

  // append relay1, and emit a REQ
  const req1relay1 = relay1.attachNextStream();
  assert(!relay1.latch.isHeld, "Relay1 should still be offline");
  sessionRelays.append(relayUrl1);
  assert(relay1.latch.isHeld, "Relay1 should be prewarmed");
  assert(!relay2.latch.isHeld, "Relay2 should still be offline");
  rxReq.emit([{ kinds: [1] }], { traceTag: 1 });
  await relay1.expectFilters([{ kinds: [1] }]);
  await req1relay1.subscribed;

  // expect to observe events from relay1
  req1relay1.next(Faker.eventPacket({ id: "1" }));
  await obs.expectNext(Expect.eventPacket({ id: "1" }));

  // append relay2
  const req1relay2 = relay2.attachNextStream();
  assert(!relay2.latch.isHeld, "Relay2 should still be offline");
  sessionRelays.append(relayUrl2);
  assert(relay1.latch.isHeld, "Relay1 should keep to be connected");
  assert(relay2.latch.isHeld, "Relay2 should be prewarmed");
  // expect to emit the same REQ to relay2
  await relay2.expectFilters([{ kinds: [1] }]);
  await req1relay2.subscribed;

  // expect to observe events from the both relays
  req1relay2.next(Faker.eventPacket({ id: "2" }));
  await obs.expectNext(Expect.eventPacket({ id: "2" }));
  req1relay1.next(Faker.eventPacket({ id: "3" }));
  await obs.expectNext(Expect.eventPacket({ id: "3" }));

  // emit a new REQ
  const req2relay1 = relay1.attachNextStream();
  const req2relay2 = relay2.attachNextStream();
  rxReq.emit([{ kinds: [2] }], { traceTag: 2 });
  await relay1.expectFilters([{ kinds: [2] }]);
  await relay2.expectFilters([{ kinds: [2] }]);
  await req2relay1.subscribed;
  await req2relay2.subscribed;

  // expect to observe events from the all streams
  req1relay1.next(Faker.eventPacket({ id: "4" }));
  await obs.expectNext(Expect.eventPacket({ id: "4" }));
  req1relay2.next(Faker.eventPacket({ id: "5" }));
  await obs.expectNext(Expect.eventPacket({ id: "5" }));
  req2relay1.next(Faker.eventPacket({ id: "6" }));
  await obs.expectNext(Expect.eventPacket({ id: "6" }));
  req2relay2.next(Faker.eventPacket({ id: "7" }));
  await obs.expectNext(Expect.eventPacket({ id: "7" }));

  // remove relay2
  sessionRelays.remove(relayUrl2);
  assert(!relay2.latch.isHeld, "Relay2 should be released");

  req2relay2.next(Faker.eventPacket({ id: "expect-to-be-ignored" }));
  req2relay1.next(Faker.eventPacket({ id: "8" }));
  await obs.expectNext(Expect.eventPacket({ id: "8" }));

  sub.unsubscribe();
  assert(!relay1.latch.isHeld, "Relay1 should be released");
  assert(!relay2.latch.isHeld, "Relay2 should be released");
});

test("dynamic relays - uncompleted REQ should be performed on added relays", async () => {
  const rxReq = new RxBackwardReq();
  const relays = new RelayMapOperator((url) => new RelayCommunicationMock(url));
  const sessionRelays = new RxRelays();

  const obs = new ObservableInspector(
    reqBackward({
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

  const req1relay1 = relay1.attachNextStream();
  sessionRelays.append(relayUrl1);
  rxReq.emit([{ kinds: [1] }], { traceTag: 1 });
  await relay1.expectFilters([{ kinds: [1] }]);
  await req1relay1.subscribed;

  req1relay1.next(Faker.eventPacket({ id: "1" }));
  await obs.expectNext(Expect.eventPacket({ id: "1" }));

  const req2relay1 = relay1.attachNextStream();
  rxReq.emit([{ kinds: [2] }], { traceTag: 2 });
  await relay1.expectFilters([{ kinds: [2] }]);
  await req2relay1.subscribed;

  const stream1 = relay2.attachNextStream();
  const stream2 = relay2.attachNextStream();
  sessionRelays.append(relayUrl2);
  await relay2.expectFilters([{ kinds: [1] }]);
  await relay2.expectFilters([{ kinds: [2] }]);
  await stream1.subscribed;
  await stream2.subscribed;
  assert(relay2.latch.isHeld, "Relay2 should be connected");

  stream1.next(Faker.eventPacket({ id: "2" }));
  await obs.expectNext(Expect.eventPacket({ id: "2" }));

  // All REQs reach EOSE
  req1relay1.complete();
  stream1.complete();
  stream2.complete();

  sessionRelays.append(relayUrl3);
  relay1.attachNextStream();
  relay2.attachNextStream();
  const req2relay3 = relay3.attachNextStream();

  rxReq.emit([{ kinds: [3] }], { traceTag: 3 });
  await relay1.expectFilters([{ kinds: [3] }]);
  await relay2.expectFilters([{ kinds: [3] }]);

  // That relay3 receives kinds:3 REQ means that
  // relay3 doesn't receive filters of completed REQ.
  await relay3.expectFilters([{ kinds: [3] }]);
  await req2relay3.subscribed;

  sub.unsubscribe();
  assert(!relay1.latch.isHeld, "Relay1 should be released");
  assert(!relay2.latch.isHeld, "Relay2 should be released");
  assert(!relay3.latch.isHeld, "Relay3 should be released");
});

test("segment scope relays", async () => {
  const rxReq = new RxBackwardReq();
  const relays = new RelayMapOperator((url) => new RelayCommunicationMock(url));
  const sessionRelays = new RxRelays();

  const obs = new ObservableInspector(
    reqBackward({
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
  await relay2.expectFilters([{ kinds: [1] }]);
  await stream2.subscribed;
  assert(relay1.latch.isHeld, "Relay1 should be connected (session scope)");
  assert(relay2.latch.isHeld, "Relay2 should be connected (segment scope)");

  stream1.next(Faker.eventPacket({ id: "expect-to-be-ignored" }));
  stream2.next(Faker.eventPacket({ id: "1" }));
  await obs.expectNext(Expect.eventPacket({ id: "1" }));

  segmentRelays.append(relayUrl3);
  await relay3.expectFilters([{ kinds: [1] }]);
  await stream3.subscribed;
  assert(relay3.latch.isHeld, "Relay3 should be connected (segment scope)");

  stream3.next(Faker.eventPacket({ id: "2" }));
  await obs.expectNext(Expect.eventPacket({ id: "2" }));

  rxReq.emit({ kinds: [2] });
  await relay1.expectFilters([{ kinds: [2] }]);
  await stream1.subscribed;

  stream1.next(Faker.eventPacket({ id: "3" }));
  await obs.expectNext(Expect.eventPacket({ id: "3" }));

  sub.unsubscribe();
});
