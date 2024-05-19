# Monitoring Connections

`RxNostr` が抱えている WebSocket 接続の状況 (`ConnectionState`) は `rxNostr.createConnectionStateObservable()` を通じて監視することができます。

```ts
import { createRxNostr } from "rx-nostr";

const rxNostr = createRxNostr();

rxNostr.createConnectionStateObservable().subscribe((packet) => {
  console.log(`${packet.from} の接続状況が ${packet.state} に変化しました。`);
});
```

::: tip RxJS Tips
このメソッドの戻り値は `ConnectionState` が変化したときに Packet を発行する `Observable<ConnectionStatePacket>` です。
:::

`ConnectionState` は以下のいずれかの値を取ります。

| `ConnectionState`      | description                                                                    |
| :--------------------- | :----------------------------------------------------------------------------- |
| `initialized`          | 初期状態。接続の準備は完了しているがまだ一度も接続は試みられていない。         |
| `connecting`           | 自動再接続以外の理由で接続を試みている。                                       |
| `connected`            | 接続状態。通信が可能な唯一の状態。                                             |
| `waiting-for-retrying` | 再接続待機中。再接続が必要だが、バックオフ戦略に基づいて待機している。         |
| `retrying`             | 再接続を試みている。                                                           |
| `dormant`              | 休眠中。通信が不要になったので一時的に切断している。                           |
| `error`                | エラー終了。規定の回数再接続を試行したが接続に失敗した。                       |
| `rejected`             | エラー終了。WebSocket がコード 4000 で終了したため、再接続は試行されなかった。 |
| `terminated`           | 終了状態。`rxNostr.dispose()` が呼び出されたためすべてのリソースを破棄した。   |

WebSocket 接続が `error` または `rejected` に至った場合、`rxNostr.reconnect()` を使用して再接続を試みることができます。以下は `error` で終了した 1 分後に再接続を試みる例です:

```ts
import { delay, filter } from "rxjs";
import { createRxNostr } from "rx-nostr";

const rxNostr = createRxNostr();

rxNostr
  .createConnectionStateObservable()
  .pipe(
    // When an error packet is received, ...
    filter((packet) => packet.state === "error"),
    // Wait one minute.
    delay(60 * 1000)
  )
  .subscribe((packet) => {
    rxNostr.reconnect(packet.from);
  });
```
