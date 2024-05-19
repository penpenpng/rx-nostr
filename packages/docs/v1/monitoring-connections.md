# Monitoring Connections

::: danger Caution
このドキュメントは rx-nostr 1.x のものです。2.x のドキュメントは[こちら](../v2/)を参照してください。
:::

`RxNostr` が抱えている WebSocket 接続の状況 (`ConnectionState`) は `createConnectionStateObservable()` を通じて監視することができます。
このメソッドの戻り値は `ConnectionState` が変化したときに Packet を発行する Observable です。

`ConnectionState` は以下のいずれかの値を取ります。

| `ConnectionState` | description                                                                                                                                                                                                                   |
| :---------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `not-started`     | 初期状態。リレー構成変更後に読み取りが不要になった接続もこの状態に戻ります。                                                                                                                                                  |
| `starting`        | 接続中。`not-started` からこの状態に遷移します。                                                                                                                                                                              |
| `ongoing`         | 正常稼働中。ただし必要な通信がない場合には内部的に close されている可能性があります。                                                                                                                                         |
| `reconnecting`    | 再接続中。backoff 設定が構成されていてかつ予期しない理由で接続が中断されたときに、 `ongoing` からこの状態に遷移します。そうでなければ、この状態をスキップして `error` に遷移します。                                          |
| `error`           | 規定の回数リトライしてなお再接続に失敗したとき、`reconnecting` からこの状態に遷移します。                                                                                                                                     |
| `rejected`        | WebSocket がコード 4000 で終了したとき、再接続を試行せずにこの状態に遷移します。これは [NIP-01 が推奨する](https://github.com/nostr-protocol/nips/blob/fab6a21a779460f696f11169ddf343b437327592/01.md?plain=1#L113)挙動です。 |
| `terminated`      | 終了状態。`rxNostr.dispose()` が呼び出されたときのみこの状態に遷移します。もう接続を利用することはできません。                                                                                                                |

WebSocket 接続が `error` または `rejected` に至った場合、`rxNostr.reconnect()` を使用して再接続を試みることができます。

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
