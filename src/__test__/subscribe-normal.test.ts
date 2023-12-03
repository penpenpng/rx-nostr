import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createMockRelay, type MockRelay } from "vitest-nostr";

import { createRxForwardReq, createRxNostr, RxNostr } from "../index.js";
import { disposeMockRelay, faker, spyEvent } from "./helper.js";

describe("", () => {
  const DEFUALT_RELAY = "ws://localhost:1234";
  const ANOTHER_RELAY = "ws://localhost:1235";
  let rxNostr: RxNostr;
  let defaultRelay: MockRelay;
  let anotherRelay: MockRelay;

  beforeEach(async () => {
    defaultRelay = createMockRelay(DEFUALT_RELAY);
    anotherRelay = createMockRelay(ANOTHER_RELAY);

    rxNostr = createRxNostr({
      retry: { strategy: "immediately", maxCount: 1 },
      skipFetchNip11: true,
      skipVerify: true,
    });
    await rxNostr.switchRelays([DEFUALT_RELAY]);
  });

  afterEach(() => {
    rxNostr.dispose();
    disposeMockRelay(defaultRelay);
    disposeMockRelay(anotherRelay);
  });

  test("[forward] Subscription on temporary relays keeps going even if default relays are changed.", async () => {
    const req = createRxForwardReq("sub");
    const spy = spyEvent();
    rxNostr
      .use(req, { relays: [ANOTHER_RELAY] })
      .pipe(spy.tap())
      .subscribe();

    req.emit(faker.filter());
    await anotherRelay.connected;
    await expect(anotherRelay).toReceiveREQ("sub:0");

    anotherRelay.emitEVENT("sub:0");
    await expect(spy).toSeeEVENT("sub:0");

    rxNostr.setDefaultRelays([]);

    anotherRelay.emitEVENT("sub:0");
    await expect(spy).toSeeEVENT("sub:0");
  });
});
