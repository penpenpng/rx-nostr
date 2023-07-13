# Relay Configuration

`RxNostr` が実際に通信するリレーセットは `rxNostr.switchRelays()` を使って構成できます。

```js
import { createRxNostr } from "rx-nostr";

const rxNostr = createRxNostr();
rxNostr.switchRelays([
  "wss://nostr1.example.com",
  "wss://nostr2.example.com",
  "wss://nostr3.example.com",
]);
```

上の例のように `rxNostr.switchRelays()` に単に WebSocket エンドポイントの URL を渡した場合、それらのリレーに対して **読み取り** と **書き込み** が両方許可されたものとして扱われます。ここで、読み取りとは `RxReq` オブジェクトを通じた REQ メッセージから始まる一連の双方向通信を、書き込みとは `rxNostr.send()` メソッドを通じた EVENT メッセージの送信から始まる一連の双方向通信を指します。

特定のリレーに対して読み取りまたは書き込みのいずれかのみを許可したい場合、`rxNostr.switchRelays()` の引数にオブジェクトのリストを渡すことができます。

```js
rxNostr.switchRelays([
  {
    url: "wss://nostr1.example.com",
    read: true,
    write: false,
  },
  {
    url: "wss://nostr2.example.com",
    read: false,
    write: true,
  },
  {
    url: "wss://nostr3.example.com",
    read: true,
    write: true,
  },
]);
```

NIP-07 インターフェースが存在するブラウザ環境下では `window.nostr.getRelays()` の引数をそのまま使うこともできます。

```js
rxNostr.switchRelays(await window.nostr.getRelays());
```

## Reactivity

リレー構成の変更は、現在確立している REQ サブスクリプションに直ちに反映されます。すなわち、新しい構成のもとでもはや読み取りが許可されなくなったリレーにおける REQ は即座に CLOSE され、逆に新しく読み取りが可能になったリレーに対しては同等の REQ が自動的に送信されます。

## Auto Reconnection

WebSocket が予期しない理由で切断されたとき、rx-nostr は [exponential backoff and jitter](https://aws.amazon.com/jp/blogs/architecture/exponential-backoff-and-jitter/) 戦略に従って自動で再接続を試みます。この挙動は `createRxNostr()` のオプションで変更できます。

## Read on a subset of relays (v1.1.0+)

構成された読み取り可能リレーのうちの一部だけで REQ サブスクリプションを確立したい場合、`rxNostr.use()` の `scope` オプションにリレーの URL のリストを指定できます。
`scope` オプションに URL を指定しても、指定された URL が構成されていない場合には読み取りは発生しないことに注意してください。

```js
rxNostr.switchRelays(["wss://nostr1.example.com", "wss://nostr2.example.com"]);

// - `wss://nostr1.example.com` will be used.
// - `wss://unknown.example.com` and `wss://not-yet.example.com`
//   will not be used because it is not in the configuration.
rxNostr.use(rxReq, {
  scope: [
    "wss://nostr1.example.com",
    "wss://unknown.example.com",
    "wss://not-yet.example.com",
  ],
});

// `addRelay()` is a wrapper of `switchRelays()`.
// This is equivalent to:
//   `rxNostr.switchRelays([...rxNostr.getRelays(), 'wss://not-yet.example.com'])`
rxNostr.addRelay("wss://not-yet.example.com");

// Now `wss://not-yet.example.com` is available.
rxReq.emit(filters);
```
