import { afterEach, beforeEach, expect, test } from "vitest";
import { createMockRelay, type MockRelay } from "vitest-nostr";

import {
  createRxBackwardReq,
  createRxNostr,
  noopVerifier,
  RxNostr,
} from "../index.js";
import { disposeMockRelay, stateWillBe } from "./helper.js";

const DEFAULT_RELAY = "ws://localhost:1234";
let rxNostr: RxNostr;
let defaultRelay: MockRelay;

beforeEach(async () => {
  defaultRelay = createMockRelay(DEFAULT_RELAY);

  rxNostr = createRxNostr({
    verifier: noopVerifier,
    skipFetchNip11: true,
    skipVerify: true,
  });
  await rxNostr.setDefaultRelays([DEFAULT_RELAY]);
});

afterEach(() => {
  rxNostr.dispose();
  disposeMockRelay(defaultRelay);
});

test("`replay` option works well.", async () => {
  const rxReq = createRxBackwardReq({ rxReqId: "sub", replay: true });

  rxReq.emit({ limit: 1 });
  rxReq.emit({ limit: 2 });
  rxReq.emit({ limit: 3 });

  rxNostr.use(rxReq).subscribe();

  await defaultRelay.connected;
  await expect(defaultRelay).toReceiveREQ(["sub:0", { limit: 1 }]);
  await expect(defaultRelay).toReceiveREQ(["sub:1", { limit: 2 }]);
  await expect(defaultRelay).toReceiveREQ(["sub:2", { limit: 3 }]);
});

test("`replay` option works well even if over() is called.", async () => {
  const rxReq = createRxBackwardReq({ rxReqId: "sub", replay: true });

  rxReq.emit({ limit: 1 });
  rxReq.emit({ limit: 2 });
  rxReq.emit({ limit: 3 });
  rxReq.over();

  rxNostr.use(rxReq).subscribe();

  await defaultRelay.connected;
  await expect(defaultRelay).toReceiveREQ(["sub:0", { limit: 1 }]);
  await expect(defaultRelay).toReceiveREQ(["sub:1", { limit: 2 }]);
  await expect(defaultRelay).toReceiveREQ(["sub:2", { limit: 3 }]);

  await expect(stateWillBe(rxNostr, DEFAULT_RELAY, "connected")).resolves.toBe(
    true,
  );

  defaultRelay.emitEOSE("sub:0");
  defaultRelay.emitEOSE("sub:1");
  defaultRelay.emitEOSE("sub:2");

  await expect(stateWillBe(rxNostr, DEFAULT_RELAY, "dormant")).resolves.toBe(
    true,
  );
});
