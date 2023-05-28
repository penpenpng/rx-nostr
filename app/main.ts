// # Playground
// Edit here and try `yarn dev`

import { delay } from "rxjs";

import { createRxBackwardReq, createRxNostr } from "../src";

document.getElementById("send")?.addEventListener("click", async () => {
  const input = document.getElementById("input") as HTMLInputElement;
  rxNostr
    .send({
      kind: 1,
      content: input.value,
      pubkey: (await window.nostr?.getPublicKey()) ?? "",
    })
    .subscribe({
      next: ({ from }) => {
        console.log("OK", from);
      },
      complete: () => {
        console.log("Send completed");
      },
    });
  input.value = "";
});

const rxNostr = createRxNostr();
rxNostr.createConnectionStateObservable().subscribe((ev) => {
  console.log(ev);
  console.log(rxNostr.getRelayState(ev.from));
});
rxNostr.setRelays([
  "wss://relay-jp.nostr.wirednet.jp",
  "wss://nostr-relay.nokotaro.com",
]);

const req0 = createRxBackwardReq();
rxNostr
  .use(req0)
  .subscribe((e) => console.log(0, e.event.kind, e.subId, e.from));

const req1 = createRxBackwardReq();
rxNostr
  .use(req1.pipe(delay(1000)))
  .subscribe((e) => console.log(1, e.event.kind, e.subId, e.from));

req0.emit([{ kinds: [0], limit: 5 }]);
req1.emit([{ kinds: [1], limit: 5 }]);

setTimeout(() => {
  rxNostr.addRelay("wss://nostr.h3z.jp");
}, 2000);
