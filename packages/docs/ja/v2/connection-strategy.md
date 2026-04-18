# Connection Strategy

**Connection Strategy** は rx-nostr が WebSocket 通信をどのタイミングで確立し、いつ切断するのかを決定づける戦略です。Connection Strategy はデフォルトリレーの上でのみ有効で、Connection Strategy の設定に関わらず、一時リレーへの接続はそれが不要になった時点で直ちに切断されます。

Connection Strategy は `createRxNostr()` の `connectionStrategy` オプションで指定でき、デフォルトは **Lazy Strategy** です。

## Lazy Strategy

**Lazy Strategy** はすべてのデフォルトリレーを一時リレーのように扱います。つまり、そのリレーへの通信が必要になったタイミングで初めて接続し、不要になったタイミングで直ちに切断します。

## Lazy-Keep Strategy

**Lazy-Keep Strategy** は Lazy Strategy と同様に必要になったタイミングで接続しますが、それがデフォルトリレーとして指定されている限りは切断しません。そのリレーがデフォルトリレーから外されたのち、不要になったタイミングで初めて切断します。

## Aggressive Strategy

**Aggressive Strategy** はそれがデフォルトリレーとして指定されたときに直ちに接続し、デフォルトリレーである限りは切断しません。Lazy-Keep Strategy と同様に、そのリレーがデフォルトリレーから外されたのち、不要になったタイミングで初めて切断します。
