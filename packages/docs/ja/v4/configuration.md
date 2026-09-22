# Configuration

## `RxNostr` constructor

```ts
const rxNostr = new RxNostr({
  verifier,
  signer,
  authenticator,
  retry,
  relayDirectory,
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
| `skipFetchNip11` | no | pool entry 作成時の自動 NIP-11 fetch を止める |
| `WebSocket` | no | runtime に注入する WebSocket constructor |
| `defaultOptions` | no | REQ / publish operation の既定値 |

AUTH は `authenticator` を指定した場合だけ有効になります。`signer` から暗黙には作られません。

`defaultOptions.req` と `defaultOptions.publish` に operation option を指定すると、個々の `req()` / `publish()` で `linger`、`timeout`、`weak` などを繰り返し指定する必要はありません。operation に明示した値は instance default より優先されます。

## Process-wide operation defaults

`RxNostr.defaultOptions` 自体が built-in の operation defaults を保持しています。複数の `RxNostr` instance で異なる値を共通利用する application は、instance の作成前にその値を変更できます。

```ts
RxNostr.defaultOptions.req.linger = 5_000;
RxNostr.defaultOptions.req.timeout = 20_000;
RxNostr.defaultOptions.publish.linger = 5_000;
RxNostr.defaultOptions.publish.timeout = 15_000;

const primary = new RxNostr({ verifier });
const secondary = new RxNostr({
  verifier,
  // この instance の REQ だけ static default を上書きします。
  defaultOptions: { req: { linger: 0 } },
});
```

static defaults は各 constructor 呼び出し時に instance 内へ snapshot されます。その後 `RxNostr.defaultOptions` を差し替えたり nested option を変更したりしても、作成済み instance の値は変わりません。

process-wide な可変設定なので、library module 内ではなく application の起動処理で設定してください。object 全体を差し替える場合、型はすべての built-in scalar option を要求します。一部だけ変更する場合は上記のように nested field を変更するか、現在値を spread してください。`verifier` などの root config は含まれないため、各 constructor で指定します。

## Built-in defaults

| option | REQ | publish |
| --- | ---: | ---: |
| `defer` | `true` | — |
| `linger` | `10_000` ms | `10_000` ms |
| `weak` | `false` | `false` |
| `timeout` | `30_000` ms | `30_000` ms |

Authenticator の `authTimeout` は省略時 30,000 ms、NIP-11 自動取得は有効です。

REQ の `timeout` は backward segment が EOSE を待つ時間です。publish の `timeout` は relay ごとの OK を待つ時間です。

## REQ arguments and options

`req(relays, request, options?)` の順です。宛先と request（`RxReq` または `{ strategy, filters }` descriptor）は必須で、operation 固有の設定だけを第3引数へ渡します。

```ts
rxNostr.req(relays, { strategy: "oneshot", filters }, {
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

`authenticator: false` で root の AUTH を operation 単位に無効化できます。

## Publish arguments and options

`publish(relays, payload, options?)` の順です。宛先と EVENT parameters は必須で、operation 固有の設定だけを第3引数へ渡します。

```ts
rxNostr.publish(relays, params, {
  signer,
  authenticator,
  linger: 10_000,
  weak: false,
  timeout: 30_000,
});
```

publish は呼び出し時の relay snapshot を使います。

## 優先順位

最も具体的な、`undefined` ではない値が優先されます。

1. `RxReq.emit()` の packet option (`relays`, `linger`, `traceTag`)
2. `req()` / `publish()` の config
3. `RxNostrConfig.defaultOptions.req/publish`
4. `RxNostr.defaultOptions.req/publish`（built-in defaults の初期値を保持）

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
rxNostr.req(relays, { strategy: "oneshot", filters: [{}] }, { linger: 0 });
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
