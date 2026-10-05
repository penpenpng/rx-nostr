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
  nip11Timeout: 30_000,
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
| `nip11Timeout` | no | 自動 NIP-11 fetch の待機時間。既定値は30,000 ms |
| `skipFetchNip11` | no | 接続需要発生時の自動 NIP-11 fetch を止める |
| `WebSocket` | no | runtime に注入する WebSocket constructor |
| `defaultOptions` | no | REQ / publish operation の既定値 |

AUTH は `authenticator` を指定した場合だけ有効になります。`signer` から暗黙には作られません。

`defaultOptions.req` と `defaultOptions.publish` に operation option を指定すると、個々の `forward()` / `backward()` / `publish()` で `linger`、`timeout`、`weak` などを繰り返し指定する必要はありません。operation に明示した値は instance default より優先されます。

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
| `nip11Timeout` | `30_000` ms |
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

## 時間値の許容範囲

単位はすべてミリ秒です。timer を使う値は `NaN`、`-Infinity`、負数、2,147,483,647 ms を超える有限値を拒否します。`Infinity` は次の表で許可した場合だけ無期限を意味します。

| option | `0` | 正の有限値 | `Infinity` |
| --- | --- | --- | --- |
| `connectionTimeout` | 不可 | 接続試行の期限 | 不可 |
| `nip11Timeout`、REQ / publish `timeout`、Authenticator `authTimeout`、Worker 検証 `timeout` | 即時 timeout | 各処理の期限 | timeout なし |
| REQ / publish / ReqPacket `linger` | 即時解放 | 終了後の保持時間 | dispose まで保持 |

`connectionTimeout`、`nip11Timeout`、instance / static default の不正値は新しい `RxNostr` の構築時に同期的に throw します。REQ / publish の operation option は呼び出し時、`RxReq.emit()` の `linger` は emit 時に同期的に throw します。`pipe()` が不正な `linger` を作った場合はその query の Observable error になります。`RelayDirectory.fetchNip11()` に不正な `timeout` を渡すと fetch を始めず Promise が reject します。`SimpleAuthenticator` と `VerificationClient` は構築時に検査し、独自 Authenticator の `authTimeout` は AUTH 開始前に検査します。

reconnector の retry `delay` と relay health policy の `suppressedUntil` は有限の非負数を要求します。これらは接続待機の内部処理で、長い deadline は timer 上限ごとに分割して待ちます。

## REQ arguments and options

`forward(relays, request, options?)` / `backward(relays, request, options?)` の順です。宛先と request（`RxReq` または filter の配列）は必須で、operation 固有の設定だけを第3引数へ渡します。

```ts
rxNostr.backward(relays, filters, {
  verifier,
  defer: true,
  linger: 10_000,
  weak: false,
  timeout: 30_000,
  skipValidateFilterMatching: false,
  skipExpirationCheck: false,
});
```

AUTH はインスタンスの接続単位の設定です。REQ・publish の config に `authenticator` は指定できません。

## Publish arguments and options

`publish(relays, payload, options?)` の順です。宛先と EVENT parameters は必須で、operation 固有の設定だけを第3引数へ渡します。

```ts
rxNostr.publish(relays, params, {
  signer,
  linger: 10_000,
  weak: false,
  timeout: 30_000,
});
```

publish は呼び出し時の relay snapshot を使います。

## 優先順位

最も具体的な、`undefined` ではない値が優先されます。

1. `RxReq.emit()` の packet option (`relays`, `linger`, `traceTag`)
2. `forward()` / `backward()` / `publish()` の config
3. `RxNostrConfig.defaultOptions.req/publish`
4. `RxNostr.defaultOptions.req/publish`（built-in defaults の初期値を保持）

constructor-level の値は `RxNostrConfig`、`RxNostr.defaultConfig` の順です。operation-level の verifier、signer はいずれの constructor-level 設定よりも優先されます。

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
rxNostr.backward(relays, [{}], { linger: 0 });
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

## 公開値の所有権

内部状態を判断に使う値と利用者へ渡す値は分離します。公開された変更可能な copy を編集しても、内部の成否・接続状態や別の observer の値は変わりません。

| 出力 | copy の単位 |
| --- | --- |
| `RxRelays.get()`、`RelayDirectory.get()` / `getOrCreate()` / `values()` | 呼び出し・反復ごと。Directory の NIP-11 metadata もネストした配列・object ごと copy |
| `RxRelays`、`RelayDirectory.observe()`、`monitorConnectionState()`、`Publication.subscribe()` | observer ごと。replay の値も新しい copy |
| `Publication.event` | Promise が解決する時に 1 回。複数回 `await` しても同じ event object |
| `RxNostrPublicationError.failures` | Error 作成時に内部結果から分離。各 failure の OK tuple も copy |

`RxNostrCallbackError.cause`、publication failure の `cause`、diagnostic の `cause` は任意のユーザー値や `Error` を含む不透明な参照で、identity を保ちます。diagnostic の `context` は浅い copy を freeze して渡し、その中の任意 object は不透明な参照として扱います。注入した verifier、reconnector、directory などの class instance も所有者側で管理してください。reconnector と relay health policy に渡す health は個別の snapshot です。
