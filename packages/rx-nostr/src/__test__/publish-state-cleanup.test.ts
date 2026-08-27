import { afterEach, beforeEach, expect, test } from "vitest";
import { createMockRelay, type MockRelay } from "vitest-nostr";

import { createRxNostr, noopVerifier, RxNostr } from "../index.js";
import {
  disposeMockRelay,
  faker,
  spySubscription,
  stateWillBe,
} from "./helper.js";

const RELAY_URL = "ws://localhost:1234";
let rxNostr: RxNostr;
let relay: MockRelay;

beforeEach(async () => {
  relay = createMockRelay(RELAY_URL);
  rxNostr = createRxNostr({
    verifier: noopVerifier,
    skipFetchNip11: true,
    connectionStrategy: "lazy",
    disconnectTimeout: 0,
  });
  await rxNostr.setDefaultRelays([RELAY_URL]);
});

afterEach(() => {
  rxNostr.dispose();
  disposeMockRelay(relay);
});

test("publish OK releases the lazy connection", async () => {
  const event = faker.event();
  const spy = spySubscription();

  rxNostr.send(event).pipe(spy.tap()).subscribe();

  await relay.connected;
  await expect(relay).toReceiveEVENT(event);

  relay.emitOK(event.id, true);

  await expect(spy.willComplete()).resolves.toBe(true);
  await expect(stateWillBe(rxNostr, RELAY_URL, "dormant")).resolves.toBe(true);
});
