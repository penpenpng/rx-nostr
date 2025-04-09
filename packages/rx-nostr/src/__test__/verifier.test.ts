import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createMockRelay, type MockRelay } from "vitest-nostr";

import { createRxForwardReq, createRxNostr, RxNostr } from "../index.js";
import { disposeMockRelay, faker, spyEvent } from "./helper.js";

describe("", () => {
  const DEFAULT_RELAY = "ws://localhost:1234";
  let rxNostr: RxNostr;
  let relay: MockRelay;

  beforeEach(async () => {
    relay = createMockRelay(DEFAULT_RELAY);

    rxNostr = createRxNostr({
      skipFetchNip11: true,
      verifier: async (params) => params.content === "ok",
    });
    await rxNostr.setDefaultRelays([DEFAULT_RELAY]);
  });

  afterEach(() => {
    rxNostr.dispose();
    disposeMockRelay(relay);
  });

  test("verifier works well", async () => {
    const req = createRxForwardReq("sub");
    const spy = spyEvent();

    rxNostr.use(req).pipe(spy.tap()).subscribe();

    req.emit(faker.filter());
    await expect(relay).toReceiveREQ("sub:0");

    relay.emitEVENT("sub:0", {
      id: "1",
      content: "ok",
    });
    await expect(spy).toSeeEVENT(["sub:0", { id: "1" }]);

    relay.emitEVENT("sub:0", {
      id: "2",
      content: "NG",
    });
    relay.emitEVENT("sub:0", {
      id: "3",
      content: "ok",
    });
    await expect(spy).toSeeEVENT(["sub:0", { id: "3" }]);
  });
});
