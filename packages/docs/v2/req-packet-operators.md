---
sidebarDepth: 0
---

# ReqPacket Operators

`rxReq` に対して適用可能な Operator のリファレンスです。

[[TOC]]

## batch()

`ReqPacket[]` の Observable を、`mergeFilter` パラメータに基づいて `ReqPacket` の Observable に変換します。[`bufferTime()`](https://rxjs.dev/api/operators/bufferTime)と併用すると便利です。

`mergeFilter` パラメータが省略された場合、フィルターは単に結合されます。

```ts
import { bufferTime } from "rxjs";
import { batch, latestEach, now } from "rx-nostr";

// ...

// kind1 のタイムラインを観測し続ける forward REQ
const timelineReq = createRxForwardReq();

// 必要に応じて kind0 を収集する backward REQ
const profileReq = createRxBackwardReq();

rxNostr.use(timelineReq).subscribe((packet) => {
  const event = packet.event;

  // タイムラインに現れたユーザの kind0 を取得
  profileReq.emit({
    kinds: [0],
    authors: [event.pubkey],
    limit: 1,
  });
});

// 短い間に大量の REQ が発行されないように、1 秒毎に REQ をまとめ上げて発行
const batchedReq = profileReq.pipe(bufferTime(1000), batch());

rxNostr
  .use(batchedReq)
  .pipe(latestEach((packet) => packet.event.pubkey))
  .subscribe((packet) => {
    console.log("kind0", packet);
  });

timelineReq.emit({ kinds: [1], since: now });
```

## chunk()

`ReqPacket` を必要に応じていくつかの `ReqPacket` に分割します。

今のところ rx-nostr は NIP-11 に定められる `max_filters` を自動で尊重することができないので、大量のフィルターを指定した REQ が発行され得る場合には `chunk()` を利用する必要があります。

第一引数は分割が必要かどうかを判定する `predicate` で、第二引数は分割の方法を指定する `toChunks` です。

```ts
import { chunk } from "rx-nostr";

const chunkedReq = rxReq.pipe(
  chunk(
    (filters) => filters.length > 100,
    (filters) => {
      const pile = [...filters];
      const chunks = [];

      while (pile.length > 0) {
        chunks.push(pile.splice(0, 100));
      }

      return chunks;
    }
  )
);

rxNostr.use(chunkedReq).subscribe(() => {
  // ...
});
```
