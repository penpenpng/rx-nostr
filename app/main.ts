// Playground

import { tap } from "rxjs";
import {
  Relay,
  Relays,
  MonoFilterReq,
  Req,
  pickMessage,
  distinctEvent,
} from "../src";
import { bech32encode } from "../src/nostr/bech32";

const consume = (label: string) => (ev: any) => console.log(label, ev);
const me = bech32encode(
  "npub133vj8ycevdle0cq8mtgddq0xtn34kxkwxvak983dx0u5vhqnycyqj6tcza"
);

const relays = new Relays([
  new Relay("wss://relay-jp.nostr.wirednet.jp"),
  new Relay("wss://nostr-relay.nokotaro.com"),
]);

const likeReq: Req = {
  subId: "sub-likes",
  filters: [{ kinds: [7], authors: [me], limit: 10 }],
};
const noteReq = new MonoFilterReq("sub-notes", {
  debounce: 1000,
  windowSize: 10,
});

relays
  .observeReq(noteReq, { onError: "silence" })
  .pipe(distinctEvent(), pickMessage())
  .subscribe(consume("[NOTE]"));
relays
  .observeReq(likeReq, { onError: "silence" })
  .pipe(
    distinctEvent(),
    pickMessage(),
    tap(({ tags }) => {
      const eventIds = tags
        .filter(([tag]) => tag === "e")
        .map(([, val]) => val);

      if (eventIds.length > 0) {
        noteReq.set("kinds", 1);
        noteReq.set("ids", ...eventIds);
      }
    })
  )
  .subscribe(consume("[LIKE]"));
