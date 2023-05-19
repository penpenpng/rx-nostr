import { WS } from "jest-websocket-mock";

import { createRxNostr, rxBackwardReq, RxNostr, rxOneshotReq } from "../index";
import { createMockRelay, expectReceiveMessage } from "./mock-relay";
import { sync } from "./test-helper";

describe("Single relay case", () => {
  const RELAY_URL = "ws://localhost:1234";
  let rxNostr: RxNostr;
  let relay: WS;

  beforeEach(async () => {
    relay = createMockRelay(RELAY_URL);

    rxNostr = createRxNostr();
    rxNostr.setRelays([RELAY_URL]);
    await relay.connected;
  });

  afterEach(() => {
    rxNostr.dispose();
    relay.close();
  });

  test("[backward] After receiving EOSE, CLOSE is sent out.", async () => {
    const req = rxBackwardReq("sub");
    rxNostr.use(req).subscribe();

    const [eoseSync, resolveEose] = sync();
    rxNostr.createAllMessageObservable().subscribe(({ message }) => {
      if (message[0] === "EOSE") {
        resolveEose();
      }
    });

    req.emit([{ kinds: [0], limit: 5 }]);
    await expectReceiveMessage(relay, [
      "REQ",
      "sub:1",
      { kinds: [0], limit: 5 },
    ]);
    await eoseSync;
    await expectReceiveMessage(relay, ["CLOSE", "sub:1"]);
  });

  test("[backward] Receipt of EOSE does not terminate the Observable.", async () => {
    const req = rxBackwardReq("sub");

    let completed = false;
    rxNostr.use(req).subscribe({
      complete() {
        completed = true;
      },
    });

    const [eoseSync, resolveEose] = sync();
    rxNostr.createAllMessageObservable().subscribe(({ message }) => {
      if (message[0] === "EOSE") {
        resolveEose();
      }
    });

    req.emit([{ kinds: [0], limit: 5 }]);
    await eoseSync;
    expect(completed).toBe(false);
  });

  test("[oneshot] Receipt of EOSE terminates the Observable.", async () => {
    const req = rxOneshotReq({
      subId: "sub",
      filters: [{ kinds: [0], limit: 5 }],
    });

    let completed = false;
    rxNostr.use(req).subscribe({
      complete() {
        completed = true;
      },
    });

    const [eoseSync, resolveEose] = sync();
    rxNostr.createAllMessageObservable().subscribe(({ message }) => {
      if (message[0] === "EOSE") {
        resolveEose();
      }
    });

    await eoseSync;
    expect(completed).toBe(true);
  });
});
