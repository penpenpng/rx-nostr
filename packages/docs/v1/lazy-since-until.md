# Lazy since/until (v1.2.0+)

::: danger Caution
このドキュメントは rx-nostr 1.x のものです。2.x のドキュメントは[こちら](../v2/)を参照してください。
:::

[First Step](./first-step.md) でも説明したように、`RxReq` から `RxNostr` に向かって `ReqPacket` を送出するためには原則として `rxReq.emit()` を使います (Oneshot Strategy においては代わりに `createOneshotRxReq()` の引数を使います)。この引数は Nostr 標準の Filter オブジェクトとほぼ同一の型を持ちますが、`since` または `until` に数値の代わりに `() => number` 型の関数を渡すこともできます。

`since`/`until` に関数を渡した場合、リレーに実際に送信される `since`/`until` の値は送信の直前に評価されます。このような `since`/`until` の遅延評価は特に WebSocket の再接続を考慮したときに便利です。例えば、現在よりも「未来」の投稿を購読するために `{ since: datetime }` フィルターを送信したとします。この購読が有効なうちに WebSocket の再接続が発生するとリレーには再度まったく同じ REQ が送信されますが、これはつまり再接続時点から見て「過去」のイベントをリレーに要求することを意味します。この振る舞いは時として望ましくありません。

`{ since: datetime }` の代わりに `{ since: () => datetime }` フィルターを使用すると、再接続時点であらためて `since` が評価されます。rx-nostr はこのユースケースのために便利な `now()` 関数を公開しています。

```js
import { createRxNostr, createRxForwardReq, now } from "rx-nostr";

const rxNostr = createRxNostr();
await rxNostr.switchRelays(["wss://nostr.example.com"]);

const rxReq = createRxForwardReq();

const observable = rxNostr.use(rxReq).subscribe(console.log);

rxReq.emit({ kinds: [1], since: now });
```
