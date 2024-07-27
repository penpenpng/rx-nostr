import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createMockRelay, type MockRelay } from "vitest-nostr";

import { WebSocketCloseCode } from "../connection/index.js";
import {
  createRxForwardReq,
  createRxNostr,
  noopVerifier,
  RxNostr,
} from "../index.js";
import { closeSocket, disposeMockRelay, faker, stateWillBe } from "./helper.js";

describe("Under a single relay", () => {
  const DEFAULT_RELAY = "ws://localhost:1234";
  let rxNostr: RxNostr;
  let relay: MockRelay;

  beforeEach(async () => {
    relay = createMockRelay(DEFAULT_RELAY);

    rxNostr = createRxNostr({
      verifier: noopVerifier,
      retry: { strategy: "off" },
      skipFetchNip11: true,
      skipVerify: true,
    });
    await rxNostr.setDefaultRelays([DEFAULT_RELAY]);
  });

  afterEach(() => {
    rxNostr.dispose();
    disposeMockRelay(relay);
  });

  test("[forward] Manually reconnection restores REQ.", async () => {
    const req = createRxForwardReq("sub");
    rxNostr.use(req).subscribe();

    req.emit(faker.filters());
    await relay.connected;
    await expect(relay).toReceiveREQ("sub:0");

    await closeSocket(relay, WebSocketCloseCode.ABNORMAL_CLOSURE);
    await expect(stateWillBe(rxNostr, DEFAULT_RELAY, "error")).resolves.toBe(
      true,
    );

    rxNostr.reconnect(DEFAULT_RELAY);
    await expect(
      stateWillBe(rxNostr, DEFAULT_RELAY, "connected"),
    ).resolves.toBe(true);
    await expect(relay).toReceiveREQ("sub:0");
  });
});

describe("Under a single keep-alive relay", async () => {
  test("[forward] Manually reconnection resend EVENTs that attempted while down.", async () => {
    // TODO
  });
});
