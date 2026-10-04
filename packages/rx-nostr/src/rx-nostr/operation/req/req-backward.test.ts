import "disposablestack/auto";
import { assert, expect, test } from "vitest";

import { Expect } from "../../../__test__/helper/expect.ts";
import {
  Faker,
  getTestReqOptions,
  RelayCommunicationMock,
  SubscriptionInspector,
} from "../../../__test__/helper/index.ts";
import { RelayMapOperator } from "../../../libs/index.ts";
import type { EventPacket } from "../../../packets/index.ts";
import { RxRelays } from "../../../rx-relays/index.ts";
import { RxReq } from "../../../rx-req/index.ts";
import { reqBackward } from "./req-backward.ts";

test("single relay", async () => {
  const rxReq = new RxReq();
  const relayUrl = "wss://relay1.example.com";
  const relays = new RelayMapOperator((url) => new RelayCommunicationMock(url));
  const relay = relays.get(relayUrl);

  const observable = reqBackward({
    relays,
    source$: rxReq.asObservable(),
    relayInput: ["wss://relay1.example.com"],
    config: getTestReqOptions({
      linger: 0,
      defer: false,
      weak: false,
    }),
  });
  const inspector = new SubscriptionInspector<EventPacket>();

  assert(relay.hasActiveLease, "Relay should be prewarmed (defer=false)");

  const sub = observable.subscribe(inspector);

  const req1 = relay.attachNextStream();
  rxReq.emit([{ kinds: [1] }], { traceTag: 1 });
  await relay.expectFilters([{ kinds: [1] }]);
  await req1.subscribed;

  req1.next(Faker.eventPacket({ id: "1" }));
  await expect(inspector.waitNext()).resolves.toEqual(Expect.eventPacket({ id: "1", traceTag: 1 }));
  req1.next(Faker.eventPacket({ id: "2" }));
  await expect(inspector.waitNext()).resolves.toEqual(Expect.eventPacket({ id: "2", traceTag: 1 }));

  const req2 = relay.attachNextStream();
  rxReq.emit([{ kinds: [2] }], { traceTag: 2 });
  await relay.expectFilters([{ kinds: [2] }]);
  await req2.subscribed;

  // The first subscription is still active.
  req1.next(Faker.eventPacket({ id: "3" }));
  await expect(inspector.waitNext()).resolves.toEqual(Expect.eventPacket({ id: "3", traceTag: 1 }));
  req2.next(Faker.eventPacket({ id: "4" }));
  await expect(inspector.waitNext()).resolves.toEqual(Expect.eventPacket({ id: "4", traceTag: 2 }));

  req1.complete();
  req2.next(Faker.eventPacket({ id: "5" }));
  await expect(inspector.waitNext()).resolves.toEqual(Expect.eventPacket({ id: "5", traceTag: 2 }));

  req2.complete();
  assert(!relay.hasActiveLease, "Relay should be released");

  const req3 = relay.attachNextStream();
  rxReq.emit([{ kinds: [3] }], { traceTag: 3 });
  await relay.expectFilters([{ kinds: [3] }]);
  await req3.subscribed;
  assert(relay.hasActiveLease, "Relay should be reconnected");

  req3.next(Faker.eventPacket({ id: "6" }));
  await expect(inspector.waitNext()).resolves.toEqual(Expect.eventPacket({ id: "6", traceTag: 3 }));

  req3.complete();
  assert(!inspector.completed, "A hot source remains subscribed after its requests finish");
  rxReq.dispose();

  await expect(inspector.waitComplete()).resolves.toBeUndefined();
  sub.unsubscribe();

  assert(relay.connectionAttemptCount === 2);
});

test("single relay, defer=true", async () => {
  const rxReq = new RxReq();
  const relayUrl = "wss://relay1.example.com";
  const relays = new RelayMapOperator((url) => new RelayCommunicationMock(url));
  const relay = relays.get(relayUrl);

  const observable = reqBackward({
    relays,
    source$: rxReq.asObservable(),
    relayInput: ["wss://relay1.example.com"],
    config: getTestReqOptions({
      linger: 0,
      defer: true,
      weak: false,
    }),
  });
  const inspector = new SubscriptionInspector<EventPacket>();

  assert(!relay.hasActiveLease, "Relay should not be prewarmed (defer=true)");

  const sub = observable.subscribe(inspector);

  const req1 = relay.attachNextStream();
  rxReq.emit([{ kinds: [1] }], { traceTag: 1 });
  await relay.expectFilters([{ kinds: [1] }]);
  await req1.subscribed;

  assert(
    relay.hasActiveLease,
    "Relay should be connected just before a demand window (defer=true)",
  );

  req1.next(Faker.eventPacket({ id: "1" }));
  await expect(inspector.waitNext()).resolves.toEqual(Expect.eventPacket({ id: "1" }));

  const req2 = relay.attachNextStream();
  rxReq.emit([{ kinds: [2] }], { traceTag: 2 });
  await relay.expectFilters([{ kinds: [2] }]);
  await req2.subscribed;

  // The first subscription is still active.
  req1.next(Faker.eventPacket({ id: "2" }));
  await expect(inspector.waitNext()).resolves.toEqual(Expect.eventPacket({ id: "2" }));
  req2.next(Faker.eventPacket({ id: "3" }));
  await expect(inspector.waitNext()).resolves.toEqual(Expect.eventPacket({ id: "3" }));

  sub.unsubscribe();
  assert(
    relay.connectionAttemptCount === 1,
    "Only one attempt should be made to connect to the relay",
  );
  assert(!relay.hasActiveLease, "Relay should be released");
});

test("single relay, weak=true", async () => {
  const rxReq = new RxReq();
  const relayUrl = "wss://relay1.example.com";
  const relays = new RelayMapOperator((url) => new RelayCommunicationMock(url));
  const relay = relays.get(relayUrl);
  relay.isHot = true;

  const observable = reqBackward({
    relays,
    source$: rxReq.asObservable(),
    relayInput: ["wss://relay1.example.com"],
    config: getTestReqOptions({
      linger: 0,
      defer: false,
      weak: true,
    }),
  });
  const inspector = new SubscriptionInspector<EventPacket>();

  assert(!relay.hasActiveLease, "Relay should not be prewarmed (weak=true)");

  const sub = observable.subscribe(inspector);

  const stream1 = relay.attachNextStream();
  rxReq.emit([{ kinds: [0] }]);
  await relay.expectFilters([{ kinds: [0] }]);
  await stream1.subscribed;

  assert(!relay.hasActiveLease, "Relay should keep to be disconnected (weak=true)");

  stream1.next(Faker.eventPacket({ id: "1" }));
  await expect(inspector.waitNext()).resolves.toEqual(Expect.eventPacket({ id: "1" }));

  sub.unsubscribe();
  assert(relay.connectionAttemptCount === 0, "No connection attempts should be made (weak=true)");
  assert(!relay.hasActiveLease, "Relay should be released");
});

test("dynamic relays", async () => {
  const rxReq = new RxReq();
  const relays = new RelayMapOperator((url) => new RelayCommunicationMock(url));
  const defaultRelays = new RxRelays();

  const observable = reqBackward({
    relays,
    source$: rxReq.asObservable(),
    relayInput: defaultRelays,
    config: getTestReqOptions({
      linger: 0,
      defer: false,
      weak: false,
    }),
  });
  const inspector = new SubscriptionInspector<EventPacket>();

  const sub = observable.subscribe(inspector);

  const relayUrl1 = "wss://relay1.example.com";
  const relay1 = relays.get(relayUrl1);
  const relayUrl2 = "wss://relay2.example.com";
  const relay2 = relays.get(relayUrl2);

  // append relay1, and emit a REQ
  const req1relay1 = relay1.attachNextStream();
  assert(!relay1.hasActiveLease, "Relay1 should still be offline");
  defaultRelays.append(relayUrl1);
  assert(relay1.hasActiveLease, "Relay1 should be prewarmed");
  assert(!relay2.hasActiveLease, "Relay2 should still be offline");
  rxReq.emit([{ kinds: [1] }], { traceTag: 1 });
  await relay1.expectFilters([{ kinds: [1] }]);
  await req1relay1.subscribed;

  // expect to observe events from relay1
  req1relay1.next(Faker.eventPacket({ id: "1" }));
  await expect(inspector.waitNext()).resolves.toEqual(Expect.eventPacket({ id: "1" }));

  // append relay2
  const req1relay2 = relay2.attachNextStream();
  assert(!relay2.hasActiveLease, "Relay2 should still be offline");
  defaultRelays.append(relayUrl2);
  assert(relay1.hasActiveLease, "Relay1 should keep to be connected");
  assert(relay2.hasActiveLease, "Relay2 should be prewarmed");
  // expect to emit the same REQ to relay2
  await relay2.expectFilters([{ kinds: [1] }]);
  await req1relay2.subscribed;

  // expect to observe events from the both relays
  req1relay2.next(Faker.eventPacket({ id: "2" }));
  await expect(inspector.waitNext()).resolves.toEqual(Expect.eventPacket({ id: "2" }));
  req1relay1.next(Faker.eventPacket({ id: "3" }));
  await expect(inspector.waitNext()).resolves.toEqual(Expect.eventPacket({ id: "3" }));

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
  await expect(inspector.waitNext()).resolves.toEqual(Expect.eventPacket({ id: "4" }));
  req1relay2.next(Faker.eventPacket({ id: "5" }));
  await expect(inspector.waitNext()).resolves.toEqual(Expect.eventPacket({ id: "5" }));
  req2relay1.next(Faker.eventPacket({ id: "6" }));
  await expect(inspector.waitNext()).resolves.toEqual(Expect.eventPacket({ id: "6" }));
  req2relay2.next(Faker.eventPacket({ id: "7" }));
  await expect(inspector.waitNext()).resolves.toEqual(Expect.eventPacket({ id: "7" }));

  // remove relay2
  defaultRelays.remove(relayUrl2);
  assert(!relay2.hasActiveLease, "Relay2 should be released");

  req2relay2.next(Faker.eventPacket({ id: "expect-to-be-ignored" }));
  req2relay1.next(Faker.eventPacket({ id: "8" }));
  await expect(inspector.waitNext()).resolves.toEqual(Expect.eventPacket({ id: "8" }));

  sub.unsubscribe();
  assert(!relay1.hasActiveLease, "Relay1 should be released");
  assert(!relay2.hasActiveLease, "Relay2 should be released");
});

test("removing an unfinished relay completes a request whose other relay finished", async () => {
  const rxReq = new RxReq();
  const relays = new RelayMapOperator((url) => new RelayCommunicationMock(url));
  const defaultRelays = new RxRelays(["wss://relay1.example.com", "wss://relay2.example.com"]);
  const relay1 = relays.get("wss://relay1.example.com");
  const relay2 = relays.get("wss://relay2.example.com");
  const req1 = relay1.attachNextStream();
  const req2 = relay2.attachNextStream();
  const observable = reqBackward({
    relays,
    source$: rxReq.asObservable(),
    relayInput: defaultRelays,
    config: getTestReqOptions({ linger: 0, defer: false, weak: false }),
  });
  const inspector = new SubscriptionInspector<EventPacket>();
  const sub = observable.subscribe(inspector);

  rxReq.emit([{}]);
  await req1.subscribed;
  await req2.subscribed;
  req1.complete();

  defaultRelays.remove("wss://relay2.example.com");
  rxReq.dispose();
  await expect(inspector.waitComplete()).resolves.toBeUndefined();
  sub.unsubscribe();
});

test("dynamic relays - uncompleted REQ should be performed on added relays", async () => {
  const rxReq = new RxReq();
  const relays = new RelayMapOperator((url) => new RelayCommunicationMock(url));
  const defaultRelays = new RxRelays();

  const observable = reqBackward({
    relays,
    source$: rxReq.asObservable(),
    relayInput: defaultRelays,
    config: getTestReqOptions({
      linger: 0,
      defer: false,
      weak: false,
    }),
  });
  const inspector = new SubscriptionInspector<EventPacket>();

  const sub = observable.subscribe(inspector);

  const relayUrl1 = "wss://relay1.example.com";
  const relay1 = relays.get(relayUrl1);
  const relayUrl2 = "wss://relay2.example.com";
  const relay2 = relays.get(relayUrl2);
  const relayUrl3 = "wss://relay3.example.com";
  const relay3 = relays.get(relayUrl3);

  const req1relay1 = relay1.attachNextStream();
  defaultRelays.append(relayUrl1);
  rxReq.emit([{ kinds: [1] }], { traceTag: 1 });
  await relay1.expectFilters([{ kinds: [1] }]);
  await req1relay1.subscribed;

  req1relay1.next(Faker.eventPacket({ id: "1" }));
  await expect(inspector.waitNext()).resolves.toEqual(Expect.eventPacket({ id: "1" }));

  const req2relay1 = relay1.attachNextStream();
  rxReq.emit([{ kinds: [2] }], { traceTag: 2 });
  await relay1.expectFilters([{ kinds: [2] }]);
  await req2relay1.subscribed;

  const stream1 = relay2.attachNextStream();
  const stream2 = relay2.attachNextStream();
  defaultRelays.append(relayUrl2);
  await relay2.expectFilters([{ kinds: [1] }]);
  await relay2.expectFilters([{ kinds: [2] }]);
  await stream1.subscribed;
  await stream2.subscribed;
  assert(relay2.hasActiveLease, "Relay2 should be connected");

  stream1.next(Faker.eventPacket({ id: "2" }));
  await expect(inspector.waitNext()).resolves.toEqual(Expect.eventPacket({ id: "2" }));

  // All REQs reach EOSE
  req1relay1.complete();
  req2relay1.complete();
  stream1.complete();
  stream2.complete();

  defaultRelays.append(relayUrl3);
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
  assert(!relay1.hasActiveLease, "Relay1 should be released");
  assert(!relay2.hasActiveLease, "Relay2 should be released");
  assert(!relay3.hasActiveLease, "Relay3 should be released");
});

test("request-specific relays", async () => {
  const rxReq = new RxReq();
  const relays = new RelayMapOperator((url) => new RelayCommunicationMock(url));
  const defaultRelays = new RxRelays();

  const observable = reqBackward({
    relays,
    source$: rxReq.asObservable(),
    relayInput: defaultRelays,
    config: getTestReqOptions({
      linger: 0,
      defer: false,
      weak: false,
    }),
  });
  const inspector = new SubscriptionInspector<EventPacket>();

  const sub = observable.subscribe(inspector);

  const relayUrl1 = "wss://relay1.example.com";
  const relay1 = relays.get(relayUrl1);
  const relayUrl2 = "wss://relay2.example.com";
  const relay2 = relays.get(relayUrl2);
  const relayUrl3 = "wss://relay3.example.com";
  const relay3 = relays.get(relayUrl3);

  defaultRelays.append(relayUrl1);

  const requestRelays = new RxRelays();
  requestRelays.append(relayUrl2);

  const stream1 = relay1.attachNextStream();
  const stream2 = relay2.attachNextStream();
  const stream3 = relay3.attachNextStream();

  rxReq.emit({ kinds: [1] }, { relays: requestRelays });
  await relay2.expectFilters([{ kinds: [1] }]);
  await stream2.subscribed;
  assert(relay1.hasActiveLease, "Relay1 should be connected (query defaults)");
  assert(relay2.hasActiveLease, "Relay2 should be connected (request destinations)");

  stream1.next(Faker.eventPacket({ id: "expect-to-be-ignored" }));
  stream2.next(Faker.eventPacket({ id: "1" }));
  await expect(inspector.waitNext()).resolves.toEqual(Expect.eventPacket({ id: "1" }));

  requestRelays.append(relayUrl3);
  await relay3.expectFilters([{ kinds: [1] }]);
  await stream3.subscribed;
  assert(relay3.hasActiveLease, "Relay3 should be connected (request destinations)");

  stream3.next(Faker.eventPacket({ id: "2" }));
  await expect(inspector.waitNext()).resolves.toEqual(Expect.eventPacket({ id: "2" }));

  rxReq.emit({ kinds: [2] });
  await relay1.expectFilters([{ kinds: [2] }]);
  await stream1.subscribed;

  stream1.next(Faker.eventPacket({ id: "3" }));
  await expect(inspector.waitNext()).resolves.toEqual(Expect.eventPacket({ id: "3" }));

  sub.unsubscribe();
});
