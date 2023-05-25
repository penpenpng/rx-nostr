// # Playground
// Edit here and try `yarn dev`

import { delay } from "rxjs";

import { createRxNostr, RxBackwardReq } from "../src";

const rxNostr = createRxNostr();
rxNostr.createConnectionStateObservable().subscribe((ev) => {
  console.log(ev);
  console.log(rxNostr.getRelayState(ev.from));
});
rxNostr.setRelays([
  "wss://relay-jp.nostr.wirednet.jp",
  "wss://nostr-relay.nokotaro.com",
]);

const req0 = new RxBackwardReq();
rxNostr
  .use(req0)
  .subscribe((e) => console.log(0, e.event.kind, e.subId, e.from));

const req1 = new RxBackwardReq();
rxNostr
  .use(req1.pipe(delay(1000)))
  .subscribe((e) => console.log(1, e.event.kind, e.subId, e.from));

req0.emit([{ kinds: [0], limit: 5 }]);
req1.emit([{ kinds: [1], limit: 5 }]);

setTimeout(() => {
  rxNostr.addRelay("wss://nostr.h3z.jp");
}, 2000);
