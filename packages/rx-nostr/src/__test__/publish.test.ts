import { afterEach, beforeEach, expect, test } from "vitest";
import { createMockRelay, type MockRelay } from "vitest-nostr";

import { createRxNostr, noopVerifier, RxNostr } from "../index.js";
import { disposeMockRelay, faker, spySubscription } from "./helper.js";

const RELAY_URL1 = "ws://localhost:1234";
const RELAY_URL2 = "ws://localhost:1235";
const RELAY_URL3 = "ws://localhost:1236";
let rxNostr: RxNostr;
let relay1: MockRelay;
let relay2: MockRelay;
let relay3: MockRelay;

beforeEach(async () => {
  relay1 = createMockRelay(RELAY_URL1);
  relay2 = createMockRelay(RELAY_URL2);
  relay3 = createMockRelay(RELAY_URL3);
  rxNostr = createRxNostr({
    verifier: noopVerifier,
  });
  await rxNostr.setDefaultRelays([
    { url: RELAY_URL1, write: true, read: false },
    { url: RELAY_URL2, write: false, read: true },
  ]);
});

afterEach(() => {
  rxNostr.dispose();
  disposeMockRelay(relay1);
  disposeMockRelay(relay2);
  disposeMockRelay(relay3);
});

test("send() sends only to writable default relays.", async () => {
  rxNostr.send(faker.event());

  await relay1.connected;
  await expect(relay1).toReceiveEVENT();

  expect(relay2.messagesToConsume.pendingItems.length).toBe(0);
});

test("send() doesn't wait for OK from default relays added later.", async () => {
  const spy = spySubscription();

  rxNostr.send(faker.event()).pipe(spy.tap()).subscribe();
  rxNostr.addDefaultRelays([RELAY_URL3]);

  await relay1.connected;
  await expect(relay1).toReceiveEVENT();

  expect(relay2.messagesToConsume.pendingItems.length).toBe(0);
  expect(relay3.messagesToConsume.pendingItems.length).toBe(0);

  relay1.emitOK("*", true);
  await expect(spy.willComplete()).resolves.toBe(true);
});

test("temporary relay option works in send().", async () => {
  rxNostr.send(faker.event(), { relays: [RELAY_URL3] });

  await relay3.connected;
  await expect(relay3).toReceiveEVENT();

  expect(relay1.messagesToConsume.pendingItems.length).toBe(0);
});

test("completeOn: 'sent' works.", async () => {
  const spy = spySubscription();

  rxNostr
    .send(faker.event(), { relays: [RELAY_URL3], completeOn: "sent" })
    .pipe(spy.tap())
    .subscribe();

  await relay3.connected;
  await expect(relay3).toReceiveEVENT();

  await expect(spy.willComplete()).resolves.toBe(true);
});
