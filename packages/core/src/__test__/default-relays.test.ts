import { afterEach, beforeEach, expect, test } from "vitest";
import { createMockRelay, type MockRelay } from "vitest-nostr";

import { createRxForwardReq, createRxNostr, RxNostr } from "../index.js";
import { disposeMockRelay, faker } from "./helper.js";

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
    skipFetchNip11: true,
    skipVerify: true,
  });
  await rxNostr.setDefaultRelays([RELAY_URL1, RELAY_URL2]);
});

afterEach(() => {
  rxNostr.dispose();
  disposeMockRelay(relay1);
  disposeMockRelay(relay2);
  disposeMockRelay(relay3);
});

test("[forward] Adding a new default relay affects existing REQ.", async () => {
  const req = createRxForwardReq("sub");

  rxNostr.use(req).subscribe();

  req.emit(faker.filters());
  await relay1.connected;
  await relay2.connected;
  await expect(relay1).toReceiveREQ("sub:0");
  await expect(relay2).toReceiveREQ("sub:0");

  await rxNostr.addDefaultRelays([RELAY_URL3]);
  await expect(relay3).toReceiveREQ("sub:0");
});

test("[forward] Removing a new default relay affects existing REQ.", async () => {
  const req = createRxForwardReq("sub");

  rxNostr.use(req).subscribe();

  req.emit(faker.filters());
  await relay1.connected;
  await relay2.connected;
  await expect(relay1).toReceiveREQ("sub:0");
  await expect(relay2).toReceiveREQ("sub:0");

  await rxNostr.removeDefaultRelays([RELAY_URL2]);
  await expect(relay2).toReceiveCLOSE("sub:0");
});
