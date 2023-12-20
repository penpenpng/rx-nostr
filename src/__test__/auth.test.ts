import { first, toArray } from "rxjs";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createMockRelay, type MockRelay } from "vitest-nostr";

import { WebSocketCloseCode } from "../connection/relay.js";
import {
  createRxBackwardReq,
  createRxForwardReq,
  createRxNostr,
  RxNostr,
} from "../index.js";
import {
  ChallengeStoreMock,
  challengeStoreMock,
  closeSocket,
  disposeMockRelay,
  expectedChallengeEvent,
  faker,
  fakeSigner,
  fakeVerifier,
  spySubscription,
} from "./helper.js";

describe("Under aggressive strategy with a persisted initial challenge.", () => {
  const DEFAULT_RELAY = "ws://localhost:1234";
  const INITIAL_CHALLENGE = "__initial_challenge__";
  const SECOND_CHALLENGE = "__second_challenge__";
  let rxNostr: RxNostr;
  let relay: MockRelay;
  let store: ChallengeStoreMock;

  beforeEach(async () => {
    relay = createMockRelay(DEFAULT_RELAY);
    store = challengeStoreMock(INITIAL_CHALLENGE);

    rxNostr = createRxNostr({
      verifier: fakeVerifier(),
      signer: fakeSigner("id"),
      authenticator: {
        strategy: "aggressive",
        signer: fakeSigner("auth"),
        store,
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

  test("When an old challenge is stored, it trys to auth immediately.", async () => {
    const req = createRxForwardReq("sub");
    rxNostr.use(req).subscribe();

    req.emit(faker.filter());
    await expect(relay).toReceiveAUTH(
      expectedChallengeEvent("auth:0", DEFAULT_RELAY, INITIAL_CHALLENGE)
    );

    relay.emit(["OK", "auth:0", true]);
    await expect(relay).toReceiveREQ("sub:0");
  });

  test("When persisted challenge is denied, it can handle following challenge, then retry to subscribe.", async () => {
    const req = createRxForwardReq("sub");
    rxNostr.use(req).subscribe();

    req.emit(faker.filter());
    await expect(relay).toReceiveAUTH(
      expectedChallengeEvent("auth:0", DEFAULT_RELAY, INITIAL_CHALLENGE)
    );

    relay.emit(["OK", "auth:0", false]);
    await expect(relay).toReceiveREQ("sub:0");

    relay.emit(["CLOSED", "sub:0", "auth-required: do auth"]);
    relay.emit(["AUTH", SECOND_CHALLENGE]);
    await expect(relay).toReceiveAUTH(
      expectedChallengeEvent("auth:1", DEFAULT_RELAY, SECOND_CHALLENGE)
    );

    relay.emit(["OK", "auth:1", true]);
    await expect(relay).toReceiveREQ("sub:0");

    expect(store.getLastChallenge()).toBe(SECOND_CHALLENGE);
  });

  test("When persisted challenge is denied, it can handle following challenge, then retry to publish.", async () => {
    const spy = spySubscription();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let oks: any;
    rxNostr
      .send(faker.event())
      .pipe(toArray(), first(), spy.tap())
      .subscribe((v) => {
        oks = v;
      });

    await expect(relay).toReceiveAUTH(
      expectedChallengeEvent("auth:0", DEFAULT_RELAY, INITIAL_CHALLENGE)
    );

    relay.emit(["OK", "auth:0", false]);
    await expect(relay).toReceiveEVENT({ id: "id:0" });

    relay.emit(["OK", "id:0", false, "auth-required: do auth"]);
    relay.emit(["AUTH", SECOND_CHALLENGE]);
    await expect(relay).toReceiveAUTH(
      expectedChallengeEvent("auth:1", DEFAULT_RELAY, SECOND_CHALLENGE)
    );

    relay.emit(["OK", "auth:1", true]);
    await expect(relay).toReceiveEVENT({ id: "id:0" });

    relay.emit(["OK", "id:0", true]);

    expect(store.getLastChallenge()).toBe(SECOND_CHALLENGE);
    await expect(spy.willComplete()).resolves.toBe(true);
    expect(oks.length).toBe(2);
  });

  test("After retrying, it retrys to auth immediately.", async () => {
    const req = createRxForwardReq("sub");
    rxNostr.use(req).subscribe();

    req.emit(faker.filter());
    await expect(relay).toReceiveAUTH(
      expectedChallengeEvent("auth:0", DEFAULT_RELAY, INITIAL_CHALLENGE)
    );

    await closeSocket(relay, WebSocketCloseCode.ABNORMAL_CLOSURE);
    await expect(relay).toReceiveAUTH(
      expectedChallengeEvent("auth:1", DEFAULT_RELAY, INITIAL_CHALLENGE)
    );

    relay.emit(["OK", "auth:1", true]);
    await expect(relay).toReceiveREQ("sub:0");

    expect(store.getLastChallenge()).toBe(INITIAL_CHALLENGE);
  });

  test.only("It can respond to sudden AUTH for additional.", async () => {
    const req = createRxBackwardReq("sub");
    rxNostr.use(req).subscribe();

    req.emit(faker.filter());
    await expect(relay).toReceiveAUTH(
      expectedChallengeEvent("auth:0", DEFAULT_RELAY, INITIAL_CHALLENGE)
    );

    relay.emit(["OK", "auth:0", true]);
    await expect(relay).toReceiveREQ("sub:0");

    req.emit(faker.filter());
    await expect(relay).toReceiveREQ("sub:1");

    relay.emit(["CLOSED", "sub:1", "auth-required: do auth"]);
    relay.emit(["AUTH", SECOND_CHALLENGE]);
    await expect(relay).toReceiveAUTH(
      expectedChallengeEvent("auth:1", DEFAULT_RELAY, SECOND_CHALLENGE)
    );

    relay.emit(["OK", "auth:1", true]);
    await expect(relay).toReceiveREQ("sub:1");

    expect(store.getLastChallenge()).toBe(SECOND_CHALLENGE);
  });
});

describe("Under aggressive strategy without a persisted challenge.", () => {
  const DEFAULT_RELAY = "ws://localhost:1234";
  const CHALLENGE = "__challenge__";
  let rxNostr: RxNostr;
  let relay: MockRelay;
  let store: ChallengeStoreMock;

  beforeEach(async () => {
    relay = createMockRelay(DEFAULT_RELAY);
    store = challengeStoreMock();

    rxNostr = createRxNostr({
      verifier: fakeVerifier(),
      signer: fakeSigner("id"),
      authenticator: {
        strategy: "aggressive",
        signer: fakeSigner("auth"),
        store,
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

  test("When subscription is denied, it can handle following challenge, then retry to subscribe.", async () => {
    const req = createRxForwardReq("sub");
    rxNostr.use(req).subscribe();

    req.emit(faker.filter());
    await expect(relay).toReceiveREQ("sub:0");

    relay.emit(["CLOSED", "sub:0", "auth-required: do auth"]);
    relay.emit(["AUTH", CHALLENGE]);

    await expect(relay).toReceiveAUTH(
      expectedChallengeEvent("auth:0", DEFAULT_RELAY, CHALLENGE)
    );
    await expect(relay).toReceiveREQ("sub:0");
  });

  test("When publication is denied, it can handle following challenge, then retry to publish.", async () => {
    rxNostr.send(faker.event());

    relay.emit(["OK", "id:0", false, "auth-required: do auth"]);
    relay.emit(["AUTH", CHALLENGE]);

    await expect(relay).toReceiveAUTH(
      expectedChallengeEvent("auth:0", DEFAULT_RELAY, CHALLENGE)
    );
    await expect(relay).toReceiveEVENT({ id: "id:0" });
  });
});

describe("Under passive strategy without a persited challenge.", () => {
  const DEFAULT_RELAY = "ws://localhost:1234";
  const CHALLENGE = "__challenge__";
  let rxNostr: RxNostr;
  let relay: MockRelay;
  let store: ChallengeStoreMock;

  beforeEach(async () => {
    relay = createMockRelay(DEFAULT_RELAY);
    store = challengeStoreMock();

    rxNostr = createRxNostr({
      verifier: fakeVerifier(),
      signer: fakeSigner("id"),
      authenticator: {
        strategy: "passive",
        signer: fakeSigner("auth"),
        store,
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

  test("When subscription is denied, it can handle following challenge, then retry to subscribe.", async () => {
    const req = createRxForwardReq("sub");
    rxNostr.use(req).subscribe();

    req.emit(faker.filter());
    await expect(relay).toReceiveREQ("sub:0");

    relay.emit(["CLOSED", "sub:0", "auth-required: do auth"]);
    relay.emit(["AUTH", CHALLENGE]);

    await expect(relay).toReceiveAUTH(
      expectedChallengeEvent("auth:0", DEFAULT_RELAY, CHALLENGE)
    );
    await expect(relay).toReceiveREQ("sub:0");
  });

  test("When publication is denied, it can handle following challenge, then retry to publish.", async () => {
    rxNostr.send(faker.event());

    relay.emit(["OK", "id:0", false, "auth-required: do auth"]);
    relay.emit(["AUTH", CHALLENGE]);

    await expect(relay).toReceiveAUTH(
      expectedChallengeEvent("auth:0", DEFAULT_RELAY, CHALLENGE)
    );
    await expect(relay).toReceiveEVENT({ id: "id:0" });
  });
});
