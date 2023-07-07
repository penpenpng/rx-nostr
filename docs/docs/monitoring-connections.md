# Monitoring Connections

`RxNostr` が抱えている WebSocket 接続の状況 (`ConnectionState`) は `createConnectionStateObservable()` を通じて監視することができます。
このメソッドの戻り値は `ConnectionState` が変化したときに Packet を発行する Observable です。

`ConnectionState` は以下のいずれかの値を取ります。

| `ConnectionState` | description                                                                                                                 |
| :---------------- | :-------------------------------------------------------------------------------------------------------------------------- |
| `not-started`     | 初期状態。リレー構成変更後に不要になった接続もこの状態に戻ります。                                                          |
| `starting`        | 接続中。`not-started` からこの状態に遷移します。                                                                            |
| `ongoing`         | 正常稼働中。ただし必要な通信がない場合には内部的に close されている可能性があります。                                       |
| `reconnecting`    | 再接続中。backoff 設定が構成されていてかつ予期しない理由で接続が中断されたときに、 `ongoing` からのみこの状態に遷移します。 |
| `error`           | 規定の回数リトライしてなお再接続に失敗したとき、`reconnecting` からこの状態に遷移します。                                   |
| `rejected`        | WebSocket がエラーコード 4000 で終了したとき、再接続を試行せずにこの状態に遷移します。                                      |
| `terminated`      | 終了状態。`RxNostr#dispose()` が呼び出されたときのみこの状態に遷移します。もう接続を利用することはできません。              |

WebSocket 接続が `error` または `rejected` に至った場合、`RxNostr#reconnect()` を使用して再接続を試みることができます。

```js
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
