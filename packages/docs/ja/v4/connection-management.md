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
| `waiting-for-connection` | 初回・再接続を問わず、接続試行の条件が整うまで待機中 |
| `connecting` | 最初の接続を試行中 |
| `connected` | 接続済み |
| `retrying` | 再接続を試行中 |
| `failed` | retry を継続できず終了した |
| `disposed` | 所有する `RxNostr` によって破棄された |

```ts
rxNostr.monitorConnectionState().subscribe(({ from, state }) => {
  switch (state.state) {
    case "waiting-for-connection":
      console.log(from, "接続待機中", state.nextAttemptAt, state.suppressionReasons);
      break;
    case "failed":
      console.error(`${from}:`, state.reason);
      break;
  }
});
```

同じ relay を使う別の `RxNostr` インスタンスは別の connection を持ちます。共有 `RelayDirectory` の health には両方の結果が集約されます。

## 既定の reconnector

`RxNostr` の既定の reconnector は exponential backoff と jitter を使い、接続需要がある限り回復を継続します。長期間の接続失敗は、後述の relay health policy によって試行頻度を下げます。

`new ExponentialBackoffReconnector()` の `maxRetries` も既定では `Infinity` です。有限の上限、`cancel`、`exhaust` は回復を終了するため、継続中の `forward` の自動復旧も終了します。

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
    return {
      action: "retry",
      delay: context.attempt * 1_000,
      suppressionReasons: [{ category: "retry-backoff", source: "my-reconnector", kind: "retry-interval" }],
    };
  },
};

const rxNostr = new RxNostr({ verifier, reconnector });
```

`retry` の `suppressionReasons` は任意です。reconnector が通知した理由をそのまま connection state に伝え、理由がなければ通常の「再接続待機中」として扱います。任意の delay を transport が `backoff` と解釈することはありません。既定の `ExponentialBackoffReconnector` は自分の待機に `category: "retry-backoff", source: "exponential-backoff"`、`kind: "backoff"` を付けます。

Promise を返す reconnector は、`context.reportWaiting?.({ nextAttemptAt?, suppressionReasons? })` で非同期処理中の待機情報を通知できます。この通知は接続試行を予約する操作ではありません。実際の待機処理は reconnector が所有し、最終的に decision を返します。ヘルスによる抑止理由とは独立して集約されます。通知がなくても非同期の判断中は待機状態を公開します。未来の `nextAttemptAt` を通知した場合は予定として表示しますが、その時刻に達するだけで retry を実行することはありません。

独自 reconnector の判断は通常の再試行を許可するもので、接続がさらにヘルス方針で遅れる場合があります。非同期の判断待ちは `context.signal` で中断できるようにしてください。

`context.health` は configured `RelayDirectory` の `consecutiveFailures`、`firstFailureAt`、`lastConnectedAt`、`lastFailureAt`、`liveConnections` snapshot です。

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

detector は `context.drop({ reason, details, affectsRelayHealth })` で原因を報告できます。既知のローカル環境要因なら `affectsRelayHealth: false` を指定し、その drop をリレーの失敗回数から除外できます。detector 名と理由は reconnector の `context.reason.detector` に渡します。`context.sessionSignal` は再接続待機を含む論理 session の寿命を表します。

ブラウザーや heartbeat の監視方法は選択した detector / reconnector に所属します。rx-nostr が browser 専用 detector を暗黙に追加することはありません。

## Relay health による接続待機

既定では、連続失敗数が5以上、かつ最初の失敗から最後の失敗まで5分以上の relay は、最後の失敗から少なくとも5分間、接続を抑止します。失敗期間が延びると抑止期間も倍増し、最大1時間になります。読み直すだけで期限が延びることはありません。

この health は WebSocket 接続の成功・失敗の観測です。サービス終了を断定するものではなく、WebSocket は接続できるが Nostr の応答がない状態を、それだけで判定するものでもありません。

期限後は、接続需要と reconnector の retry 許可が残っていれば確認接続します。継続中の `forward` に新しい接続要求を追加する必要はありません。同じ Directory を共有する instance は確認接続を一つに絞り、成功するとほかの instance の抑止も解除します。期限切れだけではヘルスは回復扱いになりません。

```ts
const rxNostr = new RxNostr({
  verifier,
  connectionTimeout: 30_000,
  relayHealthPolicy: {
    minFailures: 5,
    minFailureDuration: 5 * 60_000,
    initialRetryDelay: 5 * 60_000,
    maxRetryDelay: 60 * 60_000,
  },
});
```

`relayHealthPolicy: false` は health による抑止を無効にします。初回接続と再接続に同じヘルス方針を適用します。reconnector の非同期判断中も health を観測し、両方の待機条件が解消してから既存の接続経路で一度だけ試行します。`cancel` / `exhaust` は抑止期限や Directory 更新から再開されません。

`connectionTimeout` は一回の WebSocket 接続試行の上限時間です。既定値は30秒で、正の有限値（最大 2,147,483,647 ms）を指定します。確認接続が応答しない場合も timeout で試行を終了し、共有の試行権を解放します。抑止の待機時間はこの timeout に含みません。REQ / OK の応答を待つ operation の `timeout` とも別です。

接続需要がある間は、接続前や抑止中も Directory の記録を保持し、`forget(url)` は `false` を返します。`resetHealth(url)` は失敗履歴を解除して即座に再評価します。reconnector の判断待ちや backoff は引き続き適用されます。最後の需要を解放すると待機、購読、試行権を解放します。

### 待機理由の表示

`waiting-for-connection` の `suppressionReasons` は複数の理由を同時に持てます。`ConnectionSuppressionReason` は共通の `category`、通知元の `source`、実装固有の `kind`、任意の `nextAttemptAt` と `details` を持ちます。`details` の値は文字列、数値、boolean、null です。

| `category` | 意味 |
| --- | --- |
| `relay-health` | リレーのヘルスによる長期抑止・回復確認待ち |
| `retry-backoff` | 接続失敗後の通常の再試行間隔 |
| `environment` | 独自実装によるローカル環境の復帰待ちなど |
| `coordination` | 別の接続による回復確認との調整 |

ヘルスによる抑止中は、独自戦略が説明を省略しても `category: "relay-health"` を通知します。reconnector による理由の提供は任意で、任意の待機時間を transport が backoff や環境待機と推測することはありません。

| `category` | `source` | `kind` |
| --- | --- | --- |
| `relay-health` | `relay-health-policy` | `relay-health` |
| `retry-backoff` | `exponential-backoff` | `backoff` |
| `coordination` | `relay-directory` | `relay-probe` |

状態の `nextAttemptAt` は、次の接続試行を予定する未来の時刻（Unix milliseconds）です。時刻が判明している各条件の最大値を通知します。非同期判断や共有確認の終了など、時刻不明の条件があれば省略します。予定は後の情報によって変更されることがあり、接続実行を保証するものではありません。

`delay` は通知時点から予定までの時間で、予定が不明なら0です。`attempt` は初回試行前の待機では0、再試行では reconnector に渡す試行番号です。直前の失敗や切断がある場合だけ `reason` を付けます。

```ts
rxNostr.monitorConnectionState().subscribe(({ from, state }) => {
  if (state.state !== "waiting-for-connection") return;
  if (state.suppressionReasons?.some((reason) => reason.category === "relay-health")) {
    console.log(from, "接続失敗が続いているため回復を待っています");
  }
  if (state.nextAttemptAt !== undefined) {
    console.log("次の試行予定", new Date(state.nextAttemptAt));
  }
});
```

### 抑止戦略の差し替え

`relayHealthPolicy` は数値設定に加えて `RelaySuppressionStrategy` を受け取ります。数値設定は `ExponentialRelaySuppressionStrategy` への shorthand です。

```ts
import { RxNostr, type RelaySuppressionStrategy } from "rx-nostr";

const strategy: RelaySuppressionStrategy = {
  getSuppression({ health }) {
    if (health.liveConnections || health.consecutiveFailures < 10 || health.lastFailureAt === undefined) {
      return undefined;
    }
    return {
      suppressedUntil: health.lastFailureAt + 30 * 60_000,
      suppressionReason: {
        source: "my-health-policy",
        kind: "too-many-failures",
        details: { consecutiveFailures: health.consecutiveFailures },
      },
    };
  },
};
const rxNostr = new RxNostr({ verifier, relayHealthPolicy: strategy });
```

`getSuppression()` は正規化済み relay URL、変更不能な health snapshot、現在時刻（Unix milliseconds）を受け取り、同期的に結果を返します。`undefined` は通常の接続方針を適用する意味です。

`suppressedUntil` は抑止期限です。未来なら待機し、過去なら共有の確認試行を許可します。同じ health に対しては期限後も同じ値を返してください。`now + duration` を毎回返すと期限が延び続けるので、最後の失敗時刻などの記録に基づいて決めます。期限は非負の有限値です。

`suppressionReason` の固有説明は任意です。省略時もヘルスによる抑止として表示され、`category` は常に `relay-health` になります。戦略は通信、タイマー、共有試行権を所有しません。class instance もそのまま渡せます。

既定の判断を単独で参照する場合は、純粋関数 `evaluateRelayConnection(health, now, policy?)` を使えます。

| 結果 | 意味 |
| --- | --- |
| `{ action: "allow" }` | ヘルスによる制約なし |
| `{ action: "suppress", suppressedUntil }` | 期限まで待機 |
| `{ action: "probe", suppressedUntil }` | 期限経過済み。共有確認試行が必要 |

不正な数値設定は設定時に例外になります。独自戦略や reconnector の実行時例外は診断に記録し、`failed` / `reason.kind: "policy-error"` として終了します。方針の例外をリレーの失敗回数に加算することはありません。

## 再接続中の operation

接続が復旧した場合、継続中の REQ は再発行されます。lazy filter は再送直前に再評価されます。最終結果を確認できていない publish EVENT も再送される可能性があります。

v4 は手動 `reconnect()` API を持ちません。再試行の可否と時期は `ConnectionReconnector` で制御します。

## Structured logs

`RxNostr.logSink` は、すべての `RxNostr` インスタンスから発生した log を受け取る process-wide callback です。ログ発生箇所から同期的に呼ばれます。新しい callback を設定すると既存 instance にも適用され、`undefined` を設定すると無効になります。

```ts
RxNostr.logSink = (log) => {
  console.debug(log.level, log.event, log.message, log.context, log.cause);
};
```

値は unipls と同じく `level`、`event`、`message`、任意の `context` と `cause` を持ちます。relay 固有の log では normalized relay URL が `context.relay` にあります。ログと context は callback に渡す前に freeze されます。callback が投げた例外は無視され、operation へ伝播しません。message は人向けの説明なので、filter には machine-readable な `event` を使います。

log はデバッグや記録に役立つ補助情報です。operation の成否、callback 例外、connection の現在状態の代わりにはなりません。これらはそれぞれ `Publication`／REQ の error、`RxNostrCallbackError`、`monitorConnectionState()` で扱います。

unipls の structured log を転送し、rx-nostr 固有の接続失敗、NIP-11 自動取得失敗、宛先のない REQ なども同じ形式で記録します。ログには timestamp を付けないため、必要なら callback 内で追加してください。
