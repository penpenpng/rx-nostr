# Reconnection

WebSocket が予期しない理由で切断されたとき、rx-nostr は自動で再接続を試みます。この挙動は `createRxNostr()` の `retry` オプションで変更できます。デフォルトでは [exponential backoff and jitter](https://aws.amazon.com/jp/blogs/architecture/exponential-backoff-and-jitter/) 戦略に従って 5 回までの再接続を試行します。

WebSocket が再接続されたとき、古い接続の中で継続中だった通信は自動で復旧されます。すなわち:

- REQ が再発行されます。これに伴って過去に受信した EVENT メッセージを再度受信する可能性があります。
- まだ OK を確認できていない送信済み EVENT メッセージがあった場合、再度送信されます。

::: tip Note
WebSocket 接続がステータスコード 4000 によって切断された場合、自動再接続は行われません。これは[既に廃止された古い NIP-01 仕様](https://github.com/nostr-protocol/nips/commit/0ba4589550858bb86ed533f90054bfc642aa5350)への後方互換性のためです。
:::

## Lazy since/until

WebSocket の再接続に伴って REQ が再発行されるとき、過去に発行した REQ とまったく同一の REQ を再度発行するのは望ましくない場合があります。

例えば、現在よりも「未来」の投稿を購読するために `{ since: Math.floor(Date.now() / 1000) }` フィルターを送信したとします。この購読が有効なうちに WebSocket の再接続が発生するとリレーには再度まったく同じ REQ が送信されますが、これはつまり再接続時点から見て「過去」のイベントをリレーに要求することを意味しており、期待に反します。

この問題に対応するため、`rxReq.emit()` は Nostr 標準の Filter オブジェクトの代わりに独自の `LazyFilter` 型を許容しています。`LazyFilter` は `since` または `until` に数値の代わりに `() => number` 型の関数も受け入れる Filter です。`since`/`until` に関数を渡した場合、リレーに実際に送信される `since`/`until` の値は送信の直前に評価されます。

先の例では、`{ since: Math.floor(Date.now() / 1000) }` の代わりに `{ since: () => Math.floor(Date.now() / 1000) }` を指定すると、再接続時点であらためて `since` が評価され、常に「未来」のイベントを購読できます。rx-nostr はこのユースケースのために便利な `now` ユーティリティを公開しています。

```ts
import { createRxNostr, createRxForwardReq, now } from "rx-nostr";

const rxNostr = createRxNostr();
rxNostr.setDefaultRelays(["wss://nostr.example.com"]);

const rxReq = createRxForwardReq();

rxNostr.use(rxReq).subscribe(console.log);

rxReq.emit({ kinds: [1], since: now });
```
