# Connection Management

ひとつの `RxNostr` インスタンスは、正規化された relay URL ごとにひとつの connection session を持ちます。query、publish、hot relay は同じ connection を再利用します。

この接続群が、ひとつの `RxNostr` インスタンスの接続プールです。同じ relay を使う別の `RxNostr` インスタンスは別の connection を持ちます。共有 `RelayDirectory` の health には両方の結果が集約されます。

## 接続の寿命と回復

| 機能 | 役割 |
| --- | --- |
| [Connection Demand](./connection-demand) | query、publish、hot relay からの接続需要を共有し、接続が必要な期間を決める。`defer`、`weak`、`linger` で調整する |
| [Reconnection](./reconnection) | 接続試行の失敗や切断後、需要がある間の再試行の可否と待機を決める。relay health による抑止も接続試行に適用する |
| [Drop Detection](./drop-detection) | ready な接続の異常を独自に検出し、その接続の終了と reconnector による回復へつなげる |
| [Monitor](./monitor) | 接続状態と待機理由を観測する。監視自体は需要を作らない |

需要が発生すると接続の準備を始めます。接続が ready になると operation の通信を進め、設定した drop detector の監視を開始します。接続試行が失敗したり、接続が切断・drop されたりすると、残っている需要と reconnector の判断に従って回復を試みます。最後の需要が解放されると接続・待機を終了します。

再試行を許可されても relay health や共有 Directory の確認接続との調整によって待機することがあります。需要の登録は接続成功を保証しません。現在の状態は `monitorConnectionState()` で確認できます。

## 関連する設定

`reconnector`、`dropDetectors`、`connectionTimeout`、`relayHealthPolicy`、`relayDirectory` は `RxNostr` に指定します。接続単位で共有する AUTH の設定は [Authenticator](./authenticator)、NIP-11 と health の記録は [Relay Directory](./relay-directory)、終了処理は [Dispose](./dispose) を参照してください。
