# Getting Started

ここでは、ひとつの query と publish を実行し、最後にクライアントを破棄します。

## クライアントを作る

`createRxNostr()` には verifier が必須です。query で受け取ったイベントは、公開 Observable に流れる前に verifier で検証されます。

```ts
import { createRxNostr } from "rx-nostr";
import { SeckeySigner, SimpleVerifier } from "@rx-nostr/crypto";

const signer = new SeckeySigner("nsec1...");

const rxNostr = createRxNostr({
  verifier: new SimpleVerifier(),
  signer,
});
```

ブラウザの NIP-07 provider を使う場合は `signer` を省略できます。既定で `Nip07Signer` が使われます。

## EVENT を取得する

フィルターを `req()` へ直接渡すと、一度だけ過去イベントを取得する backward query になります。EOSE、CLOSED、timeout などによって全リレーの処理が終わると Observable が complete します。

```ts
const events = rxNostr.req([{ kinds: [1], limit: 20 }], {
  relays: [
    "wss://relay-one.example.com",
    "wss://relay-two.example.com",
  ],
});

const subscription = events.subscribe({
  next(packet) {
    console.log(`${packet.from}: ${packet.event.content}`);
  },
  complete() {
    console.log("query completed");
  },
});
```

`EventPacket` は次の形です。relay 内部の `subId` は公開されません。

```ts
interface EventPacket {
  from: string;
  type: "EVENT";
  event: Nostr.Event;
  traceTag?: string | number;
}
```

## EVENT を発行する

`publish()` は呼び出した時点で署名と送信を開始し、`Publication` を返します。`waitFor("any")` は、いずれかひとつのリレーが `OK true` を返すまで待ちます。

```ts
const publication = rxNostr.publish(
  {
    kind: 1,
    content: "Hello, Nostr!",
    tags: [],
  },
  {
    relays: [
      "wss://relay-one.example.com",
      "wss://relay-two.example.com",
    ],
  },
);

publication.subscribe((packet) => {
  console.log(packet.from, packet.ok, packet.notice);
});

await publication.waitFor("any");
console.log("少なくともひとつのリレーが EVENT を受理しました");
```

`subscribe()` は OK の観測だけを行います。この subscription を unsubscribe しても publish は取り消されません。送信努力を停止する場合は `publication.cancel()` を呼びます。

## 終了する

アプリケーションがクライアントを使い終えたら `dispose()` を呼びます。実行中の query は complete し、publication は cancel され、接続、retry、timer、listener が解放されます。

```ts
subscription.unsubscribe();
rxNostr.dispose();
```

Explicit Resource Management を利用できる環境では `using` も使えます。

```ts
using rxNostr = createRxNostr({
  verifier: new SimpleVerifier(),
});
```
