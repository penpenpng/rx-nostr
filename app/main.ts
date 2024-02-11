// # Playground
// Edit here and try `npm run dev`

import {
  createRxBackwardReq,
  createRxForwardReq,
  createRxNostr,
} from "../src/index.js";

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
  console.log(ev.state, ev.from);
});
rxNostr.switchRelays([
  "wss://relay-jp.nostr.wirednet.jp",
  "wss://nostr-relay.nokotaro.com",
]);

const req0 = createRxBackwardReq();
rxNostr
  .use(req0)
  .subscribe((e) => console.log(0, e.event.id.slice(0, 5), e.subId, e.from));

const req1 = createRxForwardReq();
rxNostr
  .use(req1)
  .subscribe((e) => console.log(1, e.event.id.slice(0, 5), e.subId, e.from));

req0.emit([{ kinds: [0], limit: 3 }]);
req1.emit([{ kinds: [1], limit: 3 }]);

setTimeout(() => {
  console.log("---");
  rxNostr.switchRelays([
    "wss://relay-jp.nostr.wirednet.jp",
    "wss://nostr.h3z.jp",
  ]);
}, 3000);
