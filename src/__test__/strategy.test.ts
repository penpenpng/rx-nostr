import { afterEach, assert, beforeEach, describe, test } from "vitest";

import {
  createRxBackwardReq,
  createRxForwardReq,
  createRxNostr,
  createRxOneshotReq,
  RxNostr,
} from "../index";
import {
  faker,
  isCLOSE,
  isREQ,
  MockRelay,
  setupMockRelay,
  subspy,
} from "./helper";

describe("Single relay case", () => {
  const RELAY_URL = "ws://localhost:1234";
  let rxNostr: RxNostr;
  let relay: MockRelay;

  beforeEach(async () => {
    relay = await setupMockRelay(RELAY_URL);

    rxNostr = createRxNostr();
    rxNostr.switchRelays([RELAY_URL]);

    await relay.connected;
  });

  afterEach(() => {
    rxNostr.dispose();
    relay.close();
  });

  test("[backward] After receiving EOSE, CLOSE is sent out.", async () => {
    const req = createRxBackwardReq("sub");
    rxNostr.use(req).pipe().subscribe();

    req.emit(faker.filter());
    assert(isREQ(await relay.next()));

    relay.emitEose("sub:0");
    assert(isCLOSE(await relay.next()));
  });

  test("[backward] Receipt of EOSE does not terminate the Observable.", async () => {
    const req = createRxBackwardReq("sub");
    const spy = subspy();
    rxNostr.use(req).pipe(spy.tap()).subscribe();

    req.emit(faker.filter());
    assert(isREQ(await relay.next()));

    relay.emitEose("sub:0");
    assert(!spy.completed());
  });

  test("[backward] Each EOSE CLOSEs the REQ in the order of arrival.", async () => {
    const req = createRxBackwardReq("sub");
    rxNostr.use(req).subscribe();

    // sub:0
    req.emit(faker.filter());
    assert(isREQ(await relay.next()));

    // sub:1
    req.emit(faker.filter());
    assert(isREQ(await relay.next()));

    // sub:2
    req.emit(faker.filter());
    assert(isREQ(await relay.next()));

    relay.emitEose("sub:2");
    assert(isCLOSE(await relay.next(), "sub:2"));

    relay.emitEose("sub:1");
    assert(isCLOSE(await relay.next(), "sub:1"));

    relay.emitEose("sub:0");
    assert(isCLOSE(await relay.next(), "sub:0"));
  });

  test("[forward] Each REQ is published with the same subId.", async () => {
    const req = createRxForwardReq("sub");
    rxNostr.use(req).subscribe();

    req.emit(faker.filter());
    assert(isREQ(await relay.next(), "sub:0"));

    req.emit(faker.filter());
    assert(isREQ(await relay.next(), "sub:0"));

    req.emit(faker.filter());
    assert(isREQ(await relay.next(), "sub:0"));
  });

  test("[oneshot] Receipt of EOSE terminates the Observable.", async () => {
    const req = createRxOneshotReq({
      subId: "sub",
      filters: faker.filter(),
    });
    const spy = subspy();
    rxNostr.use(req).pipe(spy.tap()).subscribe();

    assert(isREQ(await relay.next()));

    assert(!spy.completed());

    relay.emitEose("sub:0");
    assert(spy.completed());
  });
});

describe("Multiple relays case", () => {
  const RELAY_URL1 = "ws://localhost:1234";
  const RELAY_URL2 = "ws://localhost:1235";
  let rxNostr: RxNostr;
  let relay1: MockRelay;
  let relay2: MockRelay;

  beforeEach(async () => {
    relay1 = await setupMockRelay(RELAY_URL1);
    relay2 = await setupMockRelay(RELAY_URL2);

    rxNostr = createRxNostr();
    rxNostr.switchRelays([RELAY_URL1, RELAY_URL2]);
  });

  afterEach(() => {
    rxNostr.dispose();
    relay1.close();
    relay2.close();
  });

  test("[oneshot] Collect all events under different timing EOSE.", async () => {
    const req = createRxOneshotReq({
      subId: "sub",
      filters: faker.filter(),
    });
    const spy = subspy();
    rxNostr.use(req).pipe(spy.tap()).subscribe();

    assert(isREQ(await relay1.next()));
    assert(isREQ(await relay2.next()));

    relay1.emitEvent("sub:0"); // 1
    relay2.emitEvent("sub:0"); // 2

    relay1.emitEose("sub:0");
    assert(isCLOSE(await relay1.next()));

    relay2.emitEvent("sub:0"); // 3

    relay2.emitEose("sub:0");
    assert(isCLOSE(await relay2.next()));

    assert(spy.count() === 3);
  });
});
