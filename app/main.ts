// Playground

import { debounceTime } from "rxjs";

import {
  BackwardReq,
  collect,
  MonoFilterAccumulater,
  Relays,
  Req,
  uniq,
  verify,
} from "../src";
import { bech32encode } from "../src/nostr/bech32";

const me = bech32encode(
  "npub133vj8ycevdle0cq8mtgddq0xtn34kxkwxvak983dx0u5vhqnycyqj6tcza"
);

const relays = new Relays([
  "wss://relay-jp.nostr.wirednet.jp",
  "wss://nostr-relay.nokotaro.com",
]);

const likeReq = new Req("forever", [{ kinds: [7], authors: [me], limit: 10 }]);

const acc = new MonoFilterAccumulater();
const noteReq = BackwardReq.from(acc, debounceTime(500));

relays
  .observeReq(likeReq)
  .pipe(uniq(), collect("e", acc))
  .subscribe(console.log);

relays.observeReq(noteReq).pipe(uniq(), verify()).subscribe(console.log);
