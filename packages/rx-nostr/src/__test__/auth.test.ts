import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createMockRelay, type MockRelay } from "vitest-nostr";

import {
  createRxBackwardReq,
  createRxForwardReq,
  createRxNostr,
  RxNostr,
} from "../index.js";
import {
  disposeMockRelay,
  expectedChallengeEvent,
  faker,
  fakeSigner,
  fakeVerifier,
} from "./helper.js";

describe("Under aggressive strategy with a persisted initial challenge.", () => {
  const DEFAULT_RELAY = "ws://localhost:1234";
  const CHALLENGE1 = "__challenge1__";
  const CHALLENGE2 = "__challenge2__";
  let rxNostr: RxNostr;
  let relay: MockRelay;

  beforeEach(async () => {
    relay = createMockRelay(DEFAULT_RELAY);

    rxNostr = createRxNostr({
      verifier: fakeVerifier(),
      signer: fakeSigner("id"),
      authenticator: {
        signer: fakeSigner("auth"),
      },
      retry: { strategy: "immediately", maxCount: 1 },
      skipFetchNip11: true,
    });
    rxNostr.setDefaultRelays([DEFAULT_RELAY]);
  });

  afterEach(() => {
    rxNostr.dispose();
    disposeMockRelay(relay);
  });

  test("It works in the simplest case.", async () => {
    const req = createRxForwardReq("sub");
    rxNostr.use(req).subscribe();

    // To keep connection
    req.emit(faker.filter());
    await expect(relay).toReceiveREQ("sub:0");

    relay.emit(["AUTH", CHALLENGE1]);
    await expect(relay).toReceiveAUTH(
      expectedChallengeEvent("auth:0", DEFAULT_RELAY, CHALLENGE1),
    );
  });

  test("It can respond to AUTH for additional.", async () => {
    const req = createRxForwardReq("sub");
    rxNostr.use(req).subscribe();

    // To keep connection
    req.emit(faker.filter());
    await expect(relay).toReceiveREQ("sub:0");

    relay.emit(["AUTH", CHALLENGE1]);
    await expect(relay).toReceiveAUTH(
      expectedChallengeEvent("auth:0", DEFAULT_RELAY, CHALLENGE1),
    );

    relay.emit(["AUTH", CHALLENGE2]);
    await expect(relay).toReceiveAUTH(
      expectedChallengeEvent("auth:1", DEFAULT_RELAY, CHALLENGE2),
    );
  });

  test("It resend rejected REQ after auth.", async () => {
    const req = createRxForwardReq("sub");
    rxNostr.use(req).subscribe();

    // To keep connection
    req.emit(faker.filter());
    await expect(relay).toReceiveREQ("sub:0");

    const req2 = createRxBackwardReq("sub2");
    rxNostr.use(req2).subscribe();

    req2.emit(faker.filter());
    await expect(relay).toReceiveREQ("sub2:0");

    relay.emit(["CLOSED", "sub2:0", "auth-required: test"]);
    relay.emit(["AUTH", CHALLENGE1]);
    await expect(relay).toReceiveAUTH(
      expectedChallengeEvent("auth:0", DEFAULT_RELAY, CHALLENGE1),
    );

    relay.emit(["OK", "auth:0", true]);
    await expect(relay).toReceiveREQ("sub2:0");
  });
});
