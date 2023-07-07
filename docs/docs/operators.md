# Operators

rx-nostr の各所に存在する Observable は純粋な RxJS の Observable インスタンスなので、[operator](https://rxjs.dev/guide/operators) を適用することができます。`RxReq` だけは Observable の他に REQ Strategy 等の情報を保持するためこれそのものは Observable インスタンスではないのですが、RxJS の `observable.pipe()` と完全な互換性を持つ `pipe()` メソッドを備えているので、やはり同様に operator を適用することができます。

rx-nostr が提供する operator はもちろんのこと、RxJS が提供する強力な operator の力を借りることも可能です。以下はその一例です。より多くの例は [Examples](/guide/examples.md) を参照してください。

```js:line-numbers{8-11,15-20}
import { throttleTime } from "rxjs";
import { createRxNostr, createRxForwardReq, verify, uniq } from "rx-nostr";

const rxNostr = createRxNostr();
rxNostr.switchRelays(["wss://nostr.example.com"]);

const rxReq = createRxForwardReq()
  .pipe(
    // cf. https://rxjs.dev/api/index/function/throttleTime
    throttleTime(1000)
  );

rxNostr
  .use(rxReq)
  .pipe(
    // Verify event hash and signature
    verify(),
    // Uniq by event hash
    uniq()
  )
  .subscribe(console.log);

const authors = [];
const addAuthor = (author) => {
  authors.push(author);
  rxReq.emit([{ kinds: [1], authors }]);
};

// For example, even if a large amount of author pubkey is brought
// in from another REQ in a short period of time, they will be throttled.

addAuthor("PUBKEY1"); // This may be published,
addAuthor("PUBKEY2"); // but this will be ignored.
addAuthor("PUBKEY3"); // ditto.
addAuthor("PUBKEY4"); // same.

// One second later an REQ will be published
// to subscribe to kind1 by all pubkeys PUBKEY1-4.
```
