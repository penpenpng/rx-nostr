# Migration from v3

v4 は operation、connection、metadata の責務を分け直した major release です。v3 API の compatibility alias はありません。

## Package

`nostr-typedef` は peer dependency です。application の直接依存として追加してください。

```sh
pnpm add rx-nostr @rx-nostr/crypto nostr-typedef
```

`@rx-nostr/crypto` の signer/verifier は factory function から class へ変わっています。

```ts
// v3
import { seckeySigner, verifier } from "@rx-nostr/crypto";

// v4
import { SeckeySigner, SimpleVerifier } from "@rx-nostr/crypto";

const signer = new SeckeySigner("nsec1...");
const verifier = new SimpleVerifier();
```

rx-nostr 本体の `nip07Signer()`、`noopSigner()`、`noopVerifier` も、それぞれ `Nip07Signer`、`NoopSigner`、`NoopVerifier` の instance に置き換えます。

## Client の作成

`createRxNostr()` factory は廃止され、公開された `RxNostr` class を直接構築します。引数は省略できますが、既定の verifier は EVENT の検証時にエラーとなるため、REQ を使う場合は instance config または `RxNostr.defaultConfig` に実際の verifier を指定します。Node.js 用 WebSocket option の名前は `websocketCtor` から `WebSocket` へ変わりました。

```ts
// v3
const rxNostr = createRxNostr({
  verifier,
  websocketCtor: WebSocket,
});

// v4
const rxNostr = new RxNostr({
  verifier: new SimpleVerifier(),
  WebSocket,
});
```

## Default relay を operation の宛先へ移す

v4 は default relay を持ちません。`setDefaultRelays()`、`setAdditionalRelays()`、read/write flag は削除されました。すべての `req()` と `publish()` で宛先を指定します。

```ts
// v3
rxNostr.setDefaultRelays(["wss://relay.example.com"]);
rxNostr.use(request);

// v4
rxNostr.req(["wss://relay.example.com"], request);
```

一時的な relay と default relay の区別もありません。ReqPacket ごとの宛先変更は `emit()` の option で行います。

```ts
request.emit(filters, {
  relays: ["wss://temporary.example.com"],
});
```

## `use()` を `req()` へ移す

`createRxForwardReq()` と `createRxBackwardReq()` は constructor に変わりました。

```ts
// v3
const request = createRxForwardReq();
const events$ = rxNostr.use(request);

// v4
const request = new RxForwardReq();
const events$ = rxNostr.req(relays, request);
```

簡単な backward query では `RxBackwardReq` を作らず、oneshot descriptor を渡せます。

```ts
rxNostr.req(relays, {
  strategy: "oneshot",
  filters: [{ kinds: [1], limit: 20 }],
});
```

forward は新しい ReqPacket が直前の REQ を置き換え、backward は各 REQ を並行して EOSE まで維持する契約を保ちます。

### EventPacket

v4 の query 結果は次の形です。

```ts
interface EventPacket {
  from: RelayUrl;
  type: "EVENT";
  event: Nostr.Event;
  traceTag?: string | number;
}
```

物理的な `subId`、logical `vreqId`、raw protocol tuple は公開されません。問い合わせとの対応付けが必要なら `emit(filters, { traceTag })` を使います。

## `send()` を `publish()` へ移す

v3 の `send()` が返す Observable は、v4 では `Publication` に置き換わります。

```ts
// v3
rxNostr.send(params).subscribe(onOk);

// v4
const publication = rxNostr.publish(relays, params);
publication.subscribe(onOk);
await publication.waitFor("all");
```

v3 の `completeOn` / `cast()` に相当する成功条件は `waitFor("all")` または `waitFor("any")` で明示します。

- OK observer の unsubscribe は送信を止めない
- 送信を止める場合は `publication.cancel()`
- 実際に送った EVENT は `await publication.event`
- 宛先は `publish()` 呼び出し時の snapshot

## Connection strategy

v3 の `lazy`、`lazy-keep`、`aggressive` と default relay の接続維持は、次の option に分解されました。

| v4 mechanism | 内容 |
| --- | --- |
| `defer` | ReqPacket が来るまで query 接続を遅延する |
| `weak` | operation 自身は接続需要を作らない |
| `linger` | operation 終了後に接続需要を維持する時間 |
| `setHotRelays()` | operation がなくても接続を維持する |

既定では `defer: true`、`weak: false`、`linger: 10_000` です。

hot relay は宛先ではありません。v3 の default relay と同様に使う場合でも、operation の `relays` は別に指定してください。

## Connection state と retry

`createConnectionStateObservable()` は `monitorConnectionState()` へ変わりました。state 名と構造も v4 独自の union です。通知される state は内部状態から切り離された変更可能な copy です。

```ts
rxNostr.monitorConnectionState().subscribe(({ from, state }) => {
  console.log(from, state.state);
});
```

手動 `reconnect()` は削除されました。再接続の回数、遅延、打ち切りは `ConnectionReconnector` で制御します。

## AUTH は明示的に有効化する

v3 の `authenticator: "auto"` は削除されました。signer から `SimpleAuthenticator` を作ります。

```ts
// v3
const rxNostr = createRxNostr({
  signer,
  verifier,
  authenticator: "auto",
});

// v4
const rxNostr = new RxNostr({
  signer,
  verifier,
  authenticator: new SimpleAuthenticator(signer),
});
```

signer を指定しても AUTH は暗黙に有効になりません。operation ごとに `authenticator: false` を指定して無効化できます。

## `Nip11Registry` を `RelayDirectory` へ移す

static registry は、process-global または injectable な Directory に変わりました。

```ts
// v3
Nip11Registry.get(url);
await Nip11Registry.fetch(url);

// v4
GlobalRelayDirectory.get(url);
await GlobalRelayDirectory.fetchNip11(url);
```

application 固有の store を使う場合:

```ts
const directory = new RelayDirectory();
const rxNostr = new RxNostr({ verifier, relayDirectory: directory });
```

v4 は Directory を自動永続化しません。`exportSnapshot()` / `importSnapshot()` と application の storage を組み合わせてください。

## Dispose

`RxNostr`、`RxReq`、`RxRelays`、Worker verifier は不要になった時点で dispose してください。v4 の dispose は operation、linger、retry、AUTH、transport の順にすべての resource を終了します。

```ts
publication.cancel();
subscription.unsubscribe();
request.dispose();
relays.dispose();
rxNostr.dispose();
```

## 削除された公開能力

- v3 API 名の compatibility alias
- `createRxNostr()` factory（`new RxNostr()` に置換）
- default/additional relay と read/write flag
- transport の raw message/error/outgoing-message Observable
- query result の physical subscription identifier
- signer から暗黙に AUTH を有効化する挙動
- `reconnect()` と `polite` retry option
- `Nip11Registry` による自動永続化

これらの transport detail に依存していた場合は、operation result、connection state、`RelayDirectory`、custom retry policy のいずれに責務が属するかを分けて移行してください。
