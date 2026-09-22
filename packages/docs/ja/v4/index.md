# rx-nostr v4

rx-nostr は、Nostr リレーとの通信を RxJS の Observable として扱うためのライブラリです。複数リレーへの REQ と EVENT の送信、WebSocket 接続の共有、再接続、NIP-42 AUTH、NIP-11 の購読数制限、イベントの検証までをひとつのクライアントで管理します。

v4 では「どのリレーへ何を問い合わせるか」と「接続をいつ維持するか」を分離しました。問い合わせと発行では宛先をその都度明示し、接続の先行確立が必要な場合だけ hot relay を設定します。

```ts
import { RxNostr } from "rx-nostr";
import { SimpleVerifier } from "@rx-nostr/crypto";

const rxNostr = new RxNostr({
  verifier: new SimpleVerifier(),
});

rxNostr
  .req(["wss://relay.example.com"], [{ kinds: [1], limit: 20 }])
  .subscribe(({ from, event }) => {
    console.log(from, event);
  });
```

## v4 の中心概念

### `RxNostr`

公開 constructor から直接作成するクライアントです。ひとつのインスタンスは、正規化されたリレー URL ごとに高々ひとつの WebSocket 接続を所有します。別の `RxNostr` インスタンスとは接続を共有しません。

公開される主な操作は次のとおりです。

- `req()` — EVENT を問い合わせる
- `publish()` — EVENT を発行する
- `setHotRelays()` / `unsetHotRelays()` — 接続だけを維持する
- `monitorConnectionState()` — リレーごとの接続状態を監視する
- `dispose()` — すべての操作と接続を終了する

ライブラリや application 内の関数がクライアントを受け取る場合は、class ではなく構造的な `IRxNostr` interface を引数型にできます。これにより `RxNostr` の内部実装や private field に依存せず、同じ公開操作を実装した別の object も渡せます。

```ts
import type { IRxNostr } from "rx-nostr";

function startTimeline(client: IRxNostr) {
  return client.req(relays, [{ kinds: [1] }]);
}
```

### Operation

v4 では REQ と publish を独立した operation として扱います。operation ごとに宛先、timeout、AUTH、接続維持時間などを指定できます。あるリレーの失敗は、同じ operation に含まれる別のリレーを原則として停止させません。

### `RelayInput`

宛先には、ひとつの URL、URL の iterable、または動的な `RxRelays` を渡せます。

```ts
rxNostr.req("wss://relay.example.com", [{}]);
rxNostr.req(["wss://one.example.com", "wss://two.example.com"], [{}]);
```

URL は境界で正規化、重複排除されます。query と hot relay に渡した `RxRelays` はその後の変更にも追従します。一方、publish の宛先は呼び出し時に固定されます。

### `RelayDirectory`

リレーの NIP-11 情報と接続実績を保持する metadata store です。既定ではプロセス全体で `GlobalRelayDirectory` を共有します。Directory は接続や宛先を所有せず、情報の記録と参照だけを担います。

## v3 からの主な変更

- `setDefaultRelays()` と `setAdditionalRelays()` を廃止し、`req()` / `publish()` ごとに宛先を必須指定
- `use()` を `req()` に変更
- `send()` を、明示的な成功条件と取消を持つ `publish()` に変更
- `Nip11Registry` を injectable な `RelayDirectory` に変更
- 接続戦略を `defer`、`weak`、`linger`、hot relay に分解
- signer が存在しても AUTH は暗黙に有効化せず、`authenticator` で明示的に opt-in
- query の結果から物理的な `subId` を削除し、利用者指定の `traceTag` を提供

詳しくは[Migration from v3](./migration-guide)を参照してください。

## RxJS との関係

query と接続状態は RxJS の `Observable` です。標準の RxJS operator と、rx-nostr が提供する Nostr 向け operatorを組み合わせられます。

```ts
import { filterByKinds, timeline } from "rx-nostr";

rxNostr
  .req(["wss://relay.example.com"], [{}])
  .pipe(filterByKinds([1, 6]), timeline(100))
  .subscribe((events) => {
    console.log(events);
  });
```

Observable の基本を知らなくても `subscribe()` だけで利用できますが、unsubscribe と lifecycle の管理は必要です。
