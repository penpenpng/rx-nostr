# Configuration

## `RxNostr` constructor

```ts
const rxNostr = new RxNostr({
  verifier,
  signer,
  authenticator,
  reconnector,
  dropDetectors,
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
| `verifier` | no | 受信 EVENT の既定 verifier。省略時は検証時にエラー |
| `signer` | no | publish の既定 signer。省略時は `Nip07Signer` |
| `authenticator` | no | root の Authenticator / relay factory。`false` で static default を無効化 |
| `reconnector` | no | 再接続 policy |
| `dropDetectors` | no | 接続異常を検出する detector の iterable |
| `relayDirectory` | no | metadata/health store |
| `skipFetchNip11` | no | pool entry 作成時の自動 NIP-11 fetch を止める |
| `WebSocket` | no | runtime に注入する WebSocket constructor |
| `defaultOptions` | no | REQ / publish operation の既定値 |

AUTH は `authenticator` を指定した場合だけ有効になります。`signer` から暗黙には作られません。

`defaultOptions.req` と `defaultOptions.publish` に operation option を指定すると、個々の `req()` / `publish()` で `linger`、`timeout`、`weak` などを繰り返し指定する必要はありません。operation に明示した値は instance default より優先されます。

## Process-wide constructor defaults

constructor-level の process-wide defaults は `RxNostr.defaultConfig` にまとまっています。application の起動時に一度設定すれば、各 instance で同じ verifier や runtime adapter を繰り返す必要はありません。

```ts
RxNostr.defaultConfig.verifier = verifier;
RxNostr.defaultConfig.WebSocket = WebSocket;
RxNostr.defaultConfig.reconnector = reconnector;
RxNostr.defaultConfig.dropDetectors = dropDetectors;

const primary = new RxNostr();
const secondary = new RxNostr({
  // この instance だけ static authenticator を無効化します。
  authenticator: false,
});
```

初期値は次のとおりです。

| option | static default |
| --- | --- |
| `verifier` | EVENT 検証時に例外を投げる fail-closed verifier |
| `signer` | `Nip07Signer` |
| `authenticator` | なし（AUTH は opt-in） |
| `reconnector` | `ExponentialBackoffReconnector` |
| `dropDetectors` | `[]` |
| `relayDirectory` | `GlobalRelayDirectory` |
| `skipFetchNip11` | `false` |
| `WebSocket` | `globalThis.WebSocket` |

instance config は対応する static default より優先されます。安全な verifier を本体だけでは選べないため、既定の verifier は EVENT の検証時に例外を投げます。これにより publish-only client は `new RxNostr()` で構築できますが、REQ を使う application は instance config または `RxNostr.defaultConfig.verifier` に実際の verifier を指定する必要があります。

static に設定した object は、以後作る instance が共有します。instance ごとに状態を分離した verifier、reconnector、relay directory などが必要なら instance config に渡してください。`dropDetectors` の iterable は constructor 呼び出し時に配列へ snapshot されます。

## Process-wide operation defaults

`RxNostr.defaultOptions` 自体が built-in の operation defaults を保持しています。複数の `RxNostr` instance で異なる値を共通利用する application は、instance の作成前にその値を変更できます。

```ts
RxNostr.defaultConfig.verifier = verifier;
RxNostr.defaultOptions.req.linger = 5_000;
RxNostr.defaultOptions.req.timeout = 20_000;
RxNostr.defaultOptions.publish.linger = 5_000;
RxNostr.defaultOptions.publish.timeout = 15_000;

const primary = new RxNostr();
const secondary = new RxNostr({
  // この instance の REQ だけ static default を上書きします。
  defaultOptions: { req: { linger: 0 } },
});
```

static defaults は各 constructor 呼び出し時に instance 内へ snapshot されます。その後 `RxNostr.defaultConfig` や `RxNostr.defaultOptions` を差し替えたり field を変更したりしても、作成済み instance が選択済みの値は変わりません。

process-wide な可変設定なので、library module 内ではなく application の起動処理で設定してください。object 全体を差し替える場合、型は namespace に必要な全 field を要求します。一部だけ変更する場合は上記のように field を変更するか、現在値を spread してください。

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

constructor-level の値は `RxNostrConfig`、`RxNostr.defaultConfig` の順です。operation-level の verifier、signer、authenticator はいずれの constructor-level 設定よりも優先されます。

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
