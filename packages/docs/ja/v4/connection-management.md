# Connection Management

ひとつの `RxNostr` インスタンスは、正規化された relay URL ごとにひとつの connection session を持ちます。query、publish、hot relay は同じ connection を再利用します。

## 接続状態を監視する

`monitorConnectionState()` は、既にインスタンス内に存在する relay と、subscribe 後に作られる relay の状態を通知します。監視だけでは接続を作りません。

```ts
const subscription = rxNostr.monitorConnectionState().subscribe((packet) => {
  console.log(packet.from, packet.state.state);
});
```

`packet.state` は rx-nostr 独自の discriminated union です。各 observer は変更可能な独立 copy を受け取るため、値を変更しても接続状態やほかの observer には影響しません。

| `state` | 意味 |
| --- | --- |
| `dormant` | 接続需要がなく、切断している |
| `connecting` | 最初の接続を試行中 |
| `connected` | 接続済み |
| `waiting-for-retry` | retry policy が指定した時間を待機中 |
| `retrying` | 再接続を試行中 |
| `failed` | retry を継続できず終了した |
| `disposed` | 所有する `RxNostr` によって破棄された |

```ts
rxNostr.monitorConnectionState().subscribe(({ from, state }) => {
  switch (state.state) {
    case "waiting-for-retry":
      console.log(`${from}: ${state.delay}ms 後に retry ${state.attempt}`);
      break;
    case "failed":
      console.error(`${from}:`, state.reason);
      break;
  }
});
```

同じ relay を使う別の `RxNostr` インスタンスは別の connection を持ちます。共有 `RelayDirectory` の health には両方の結果が集約されます。

## 既定の reconnector

既定の `ExponentialBackoffReconnector` は exponential backoff と jitter を使い、失敗した最初の接続のあと最大5回 retry します。

```ts
import { ExponentialBackoffReconnector } from "rx-nostr";

const reconnector = new ExponentialBackoffReconnector({
  maxRetries: 8,
  initialDelay: 500,
  maxDelay: 60_000,
  jitter: 0.2,
});

const rxNostr = new RxNostr({ verifier, reconnector });
```

最終的な connection demand が解放された場合は `dormant` になり、retry は開始されません。

## Custom reconnector

`ConnectionReconnector` は retry ごとに `retry`、`cancel`、`exhaust` のいずれかを返します。Promise を返すこともできます。

```ts
import type { ConnectionReconnector } from "rx-nostr";

const reconnector: ConnectionReconnector = {
  reconnect(context) {
    if (context.signal.aborted) return { action: "cancel" };
    if (context.attempt > 3) return { action: "exhaust" };

    console.log(context.relay, context.reason, context.health);
    return { action: "retry", delay: context.attempt * 1_000 };
  },
};

const rxNostr = new RxNostr({ verifier, reconnector });
```

`context.health` は configured `RelayDirectory` の `consecutiveFailures`、`lastConnectedAt`、`lastFailureAt` snapshot です。

自動 retry を行わない場合は `NoopReconnector` を指定します。

## Drop detector

`dropDetectors` には、接続が ready になったあと独自の条件で異常を検出する detector を指定できます。公開される context は rx-nostr 独自型であり、送受信値には Nostr message tuple を使います。

```ts
import type { ConnectionDropDetector } from "rx-nostr";

const heartbeat: ConnectionDropDetector = {
  name: "heartbeat",
  setup(context) {
    context.run(async (signal) => {
      while (!signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, 30_000));
        if (signal.aborted) return;

        try {
          await context.request({
            query: ["COUNT", "heartbeat", { limit: 1 }],
            selector: (message) => message[0] === "COUNT" && message[1] === "heartbeat",
            timeout: 5_000,
            signal,
          });
        } catch {
          context.drop();
        }
      }
    });
  },
};

const rxNostr = new RxNostr({ verifier, dropDetectors: [heartbeat] });
```

`setup()` は物理 connection ごとに呼ばれます。返した disposer と `context.defer()` へ登録した disposer は、その connection の終了時に実行されます。`signal` も同時に abort され、`drop()` が最初に接続異常を報告した場合は configured reconnector による復旧へ進みます。

## 再接続中の operation

接続が復旧した場合、継続中の REQ は再発行されます。lazy filter は再送直前に再評価されます。最終結果を確認できていない publish EVENT も再送される可能性があります。

v4 は手動 `reconnect()` API を持ちません。再試行の可否と時期は `ConnectionReconnector` で制御します。
