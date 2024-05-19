import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createMockRelay, type MockRelay } from "vitest-nostr";

import { WebSocketCloseCode } from "../connection/index.js";
import {
  createRxBackwardReq,
  createRxForwardReq,
  createRxNostr,
  RxNostr,
} from "../index.js";
import {
  closeSocket,
  disposeMockRelay,
  faker,
  spyEvent,
  stateWillBe,
} from "./helper.js";

describe("Under a single relay", () => {
  const DEFAULT_RELAY = "ws://localhost:1234";
  let rxNostr: RxNostr;
  let relay: MockRelay;

  beforeEach(async () => {
    relay = createMockRelay(DEFAULT_RELAY);

    rxNostr = createRxNostr({
      retry: { strategy: "immediately", maxCount: 1 },
      skipFetchNip11: true,
      skipVerify: true,
    });
    await rxNostr.setDefaultRelays([DEFAULT_RELAY]);
  });

  afterEach(() => {
    rxNostr.dispose();
    disposeMockRelay(relay);
  });

  test("[forward] If connection is abnormally closed, REQ will be retried.", async () => {
    const req = createRxForwardReq("sub");
    const spy = spyEvent();
    rxNostr.use(req).pipe(spy.tap()).subscribe();

    req.emit(faker.filters());
    await relay.connected;
    await expect(relay).toReceiveREQ("sub:0");

    await closeSocket(relay, WebSocketCloseCode.ABNORMAL_CLOSURE);
    await expect(relay).toReceiveREQ("sub:0");

    relay.emitEVENT("sub:0");
    await expect(spy).toSeeEVENT();
  });

  test("[forward] If connection is closed with 4000, REQ will not be retried.", async () => {
    const req = createRxForwardReq("sub");
    rxNostr.use(req).subscribe();

    req.emit(faker.filters());
    await relay.connected;
    await expect(relay).toReceiveREQ("sub:0");

    await closeSocket(relay, WebSocketCloseCode.DONT_RETRY);
    await expect(stateWillBe(rxNostr, DEFAULT_RELAY, "rejected")).resolves.toBe(
      true
    );
  });

  test("[backward] If connection is abnormally closed before receiving EOSE, REQ will be retried.", async () => {
    const req = createRxBackwardReq("sub");
    const spy = spyEvent();
    rxNostr.use(req).pipe(spy.tap()).subscribe();

    req.emit(faker.filters());
    await relay.connected;
    await expect(relay).toReceiveREQ("sub:0");

    await closeSocket(relay, WebSocketCloseCode.ABNORMAL_CLOSURE);
    await expect(relay).toReceiveREQ("sub:0");

    relay.emitEVENT("sub:0");
    await expect(spy).toSeeEVENT();

    relay.emitEOSE("sub:0");
    await expect(relay).toReceiveCLOSE("sub:0");
  });

  test("[backward] If connection is abnormally closed after receiving EOSE, REQ will not be retried.", async () => {
    const req = createRxBackwardReq("sub");
    rxNostr.use(req).subscribe();

    req.emit(faker.filters());
    await relay.connected;
    await expect(relay).toReceiveREQ("sub:0");

    relay.emitEOSE("sub:0");
    await expect(relay).toReceiveCLOSE("sub:0");

    await closeSocket(relay, WebSocketCloseCode.ABNORMAL_CLOSURE);

    rxNostr.send(faker.event());
    await expect(relay).toReceiveEVENT();
  });

  test("[forward] Retry option `maxCount` works.", async () => {
    const req = createRxForwardReq("sub");
    rxNostr.use(req).subscribe();

    req.emit(faker.filters());
    await relay.connected;
    await expect(relay).toReceiveREQ("sub:0");

    await closeSocket(relay, WebSocketCloseCode.ABNORMAL_CLOSURE, 0);
    await expect(relay).toReceiveREQ("sub:0");

    await closeSocket(relay, WebSocketCloseCode.ABNORMAL_CLOSURE, 1);
    await expect(stateWillBe(rxNostr, DEFAULT_RELAY, "error")).resolves.toBe(
      true
    );
  });

  test("[forward] since/until is reevaluated when a lazy REQ is resubmitted.", async () => {
    const req = createRxForwardReq("sub");
    rxNostr.use(req).subscribe();

    let since = 0;

    req.emit({ ...faker.filter(), since: () => since++ });
    await relay.connected;
    await expect(relay).toReceiveREQ([
      "sub:0",
      { ...faker.filter(), since: 0 },
    ]);

    await closeSocket(relay, WebSocketCloseCode.ABNORMAL_CLOSURE);
    await expect(relay).toReceiveREQ([
      "sub:0",
      { ...faker.filter(), since: 1 },
    ]);
  });
});
