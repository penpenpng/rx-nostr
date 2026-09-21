# Publish

`rxNostr.publish()` は EVENT の署名と複数リレーへの送信を管理し、ひとつの hot operation である `Publication` を返します。

```ts
const publication = rxNostr.publish(
  {
    kind: 1,
    content: "Hello, Nostr!",
    tags: [],
  },
  { relays: ["wss://relay.example.com"] },
);
```

query と異なり、publish は `subscribe()` を待たず、呼び出された時点で署名を開始します。`RxRelays` を渡した場合も、宛先はこの時点の snapshot に固定されます。

## OK を観測する

`Publication.subscribe()` はリレーから届いた個々の `OkPacket` を通知します。

```ts
const observer = publication.subscribe({
  next(packet) {
    console.log(packet.from, packet.eventId, packet.ok, packet.notice);
  },
  complete() {
    console.log("all relay efforts completed");
  },
});
```

受信済みの OK は、あとから subscribe した observer にも replay されます。observer の unsubscribe は観測をやめるだけで、送信処理を取り消しません。

## 成功条件を待つ

`waitFor()` は application が必要とする集約条件を Promise として表します。

```ts
await publication.waitFor("all"); // 全宛先で OK true
await publication.waitFor("any"); // いずれかの宛先で OK true
```

`"any"` が成功しても、残りのリレーへの送信は継続します。不要なら明示的に `cancel()` してください。

条件を満たせない場合は `RxNostrPublicationError` で reject されます。

| `code` | 意味 |
| --- | --- |
| `no-relays` | 有効な宛先がない |
| `cancelled` | publication が取り消された |
| `not-all-accepted` | `all` を満たせない宛先が発生した |
| `all-failed` | `any` を満たさないまま全宛先が失敗した |

`error.failures` には、relay ごとの `rejected`、`timeout`、`dropped`、`retry-exhausted`、`cancelled`、`auth`、`failed` が格納されます。

```ts
import { RxNostrPublicationError } from "rx-nostr";

try {
  await publication.waitFor("all");
} catch (error) {
  if (error instanceof RxNostrPublicationError) {
    console.error(error.code, error.failures);
  }
}
```

## 署名済み EVENT を取得する

`event` は、すべての宛先で実際に使用する immutable な EVENT snapshot へ resolve します。EVENT 自体と tags は凍結され、signer が返した object から切り離されています。

```ts
const event = await publication.event;
console.log(event.id);
```

署名に失敗した場合、`event` と OK stream は `RxNostrCallbackError` で失敗します。

## 取り消す

`cancel()` は未完了の全リレーへの送信、AUTH 待機、timeout、接続需要を停止します。複数回呼んでも安全です。

```ts
publication.cancel();
observer.unsubscribe();
```

`RxNostr.dispose()` を呼んだ場合も、そのインスタンスが所有する未完了の publication はすべて cancel されます。

## Option

```ts
const publication = rxNostr.publish(params, {
  relays,
  signer,
  authenticator,
  timeout: 30_000,
  linger: 10_000,
  weak: false,
});
```

- `signer` — この publication だけで使う signer
- `authenticator` — root の AUTH 設定を上書きする。`false` で無効化
- `timeout` — 各リレーの OK 待機時間
- `linger` — operation 終了後に接続需要を保持する時間
- `weak` — 新しい接続需要を作らず、既に利用可能な接続だけを使う

再接続が成功した場合、まだ最終結果が確認できていない EVENT は再送される可能性があります。Nostr EVENT は同じ ID で冪等に扱えるよう設計してください。
