import { createRxNostr, RxBackwardReq } from "../index";
import { createMockRelay, expectReceiveMessage } from "./mock-relay";

test("After receiving EVENTs for the limit, CLOSE is sent out.", async () => {
  const RELAY_URL = "ws://localhost:1234";
  const relay = createMockRelay(RELAY_URL);

  const rxNostr = createRxNostr();
  rxNostr.setRelays([RELAY_URL]);
  await relay.connected;

  const req = new RxBackwardReq("sub");
  rxNostr.use(req).subscribe();

  req.emit([{ kinds: [0], limit: 5 }]);
  await expectReceiveMessage(relay, ["REQ", "sub:1", { kinds: [0], limit: 5 }]);
  await expectReceiveMessage(relay, ["CLOSE", "sub:1"]);

  rxNostr.dispose();
});
