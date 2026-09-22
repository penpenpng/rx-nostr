# Configuration

## `RxNostr` constructor

```ts
const rxNostr = new RxNostr({
  verifier,
  signer,
  authenticator,
  retry,
  relayDirectory,
  authTimeout: 30_000,
  skipFetchNip11: false,
  WebSocket,
  defaultOptions: {
    req: {},
    publish: {},
  },
});
```

| option | 必須 | 内容 |
| --- | --- | --- |
| `verifier` | yes | 受信 EVENT の既定 verifier |
| `signer` | no | publish の既定 signer。省略時は `Nip07Signer` |
| `authenticator` | no | root の Authenticator または relay factory |
| `retry` | no | 接続 retry policy |
| `relayDirectory` | no | metadata/health store |
| `authTimeout` | no | AUTH EVENT の OK 待機時間 |
| `skipFetchNip11` | no | pool entry 作成時の自動 NIP-11 fetch を止める |
| `WebSocket` | no | runtime に注入する WebSocket constructor |
| `defaultOptions` | no | REQ / publish operation の既定値 |

AUTH は `authenticator` を指定した場合だけ有効になります。`signer` から暗黙には作られません。

## Built-in defaults

| option | REQ | publish |
| --- | ---: | ---: |
| `defer` | `true` | — |
| `linger` | `10_000` ms | `10_000` ms |
| `weak` | `false` | `false` |
| `timeout` | `30_000` ms | `30_000` ms |

`authTimeout` は 30,000 ms、NIP-11 自動取得は有効です。

REQ の `timeout` は backward segment が EOSE を待つ時間です。publish の `timeout` は relay ごとの OK を待つ時間です。

## REQ config

```ts
rxNostr.req(filters, {
  relays,
  verifier,
  authenticator,
  defer: true,
  linger: 10_000,
  weak: false,
  timeout: 30_000,
  skipValidateFilterMatching: false,
  skipExpirationCheck: false,
});
```

`relays` は必須です。`authenticator: false` で root の AUTH を operation 単位に無効化できます。

## Publish config

```ts
rxNostr.publish(params, {
  relays,
  signer,
  authenticator,
  linger: 10_000,
  weak: false,
  timeout: 30_000,
});
```

`relays` は必須です。publish は呼び出し時の relay snapshot を使います。

## 優先順位

最も具体的な、`undefined` ではない値が優先されます。

1. `RxReq.emit()` の packet option (`relays`, `linger`, `traceTag`)
2. `req()` / `publish()` の config
3. `RxNostrConfig.defaultOptions.req/publish`
4. root signer/verifier と built-in defaults

nullish な値だけを fallback するため、`false`、`0`、`Infinity` はそのまま有効です。

```ts
const rxNostr = new RxNostr({
  verifier,
  defaultOptions: {
    req: {
      defer: false,
      linger: 5_000,
    },
    publish: {
      timeout: 15_000,
    },
  },
});

// この query だけ linger を 0 にします。
rxNostr.req([{}], { relays, linger: 0 });
```

## Callback error

lazy filter、signer、verifier、authenticator が投げた値は `RxNostrCallbackError` で包まれます。

```ts
import { RxNostrCallbackError } from "rx-nostr";

if (error instanceof RxNostrCallbackError) {
  console.error(error.callback); // filter | signer | verifier | authenticator
  console.error(error.cause);
}
```
