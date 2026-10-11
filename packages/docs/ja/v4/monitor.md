# Monitor

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
      console.log(from, "接続待機中", state.suppressionReasons);
      break;
    case "failed":
      console.error(`${from}:`, state.reason);
      break;
  }
});
```


## 待機理由の表示

`waiting-for-connection` の `suppressionReasons` は複数の理由を同時に持てます。`ConnectionSuppressionReason` は共通の `category`、通知元の `source`、実装固有の `kind`、任意の `details` を持ちます。`details` の値は文字列、数値、boolean、null です。

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

接続状態には待機理由を公開します。複数の待機条件や終了時刻の不明な条件があるため、次の接続試行時刻や残り待ち時間は公開しません。

`attempt` は初回試行前の待機では0、再試行では reconnector に渡す試行番号です。直前の失敗や切断がある場合だけ `reason` を付けます。

```ts
rxNostr.monitorConnectionState().subscribe(({ from, state }) => {
  if (state.state !== "waiting-for-connection") return;
  if (state.suppressionReasons?.some((reason) => reason.category === "relay-health")) {
    console.log(from, "接続失敗が続いているため回復を待っています");
  }
});
```

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
