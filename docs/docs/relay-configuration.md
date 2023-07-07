# Relay Configuration

`RxNostr` が実際に通信するリレーセットは `switchRelays()` を使って構成できます。

```js
import { createRxNostr } from "rx-nostr";

const rxNostr = createRxNostr();
rxNostr.switchRelays([
  "wss://nostr1.example.com",
  "wss://nostr2.example.com",
  "wss://nostr3.example.com",
]);
```

上の例のように `switchRelays()` に単に WebSocket エンドポイントの URL を渡した場合、それらのリレーに対して **読み取り** と **書き込み** が両方許可されたものとして扱われます。ここで、読み取りとは `RxReq` オブジェクトを通じた REQ メッセージから始まる一連の双方向通信を、書き込みとは `send()` メソッドを通じた EVENT メッセージの送信から始まる一連の双方向通信を指します。

特定のリレーに対して読み取りまたは書き込みのいずれかのみを許可したい場合、`switchRelays()` の引数にオブジェクトのリストを渡すことができます。

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

NIP-07 インターフェースが存在するブラウザ環境下では `getRelays()` の引数をそのまま使うこともできます。

```js
rxNostr.switchRelays(await window.nostr.getRelays());
```

## Reactivity

リレー構成の変更は、現在確立している REQ サブスクリプションに直ちに反映されます。すなわち、新しい構成のもとでもはや読み取りが許可されなくなったリレーにおける REQ は即座に CLOSE され、逆に新しく読み取りが可能になったリレーに対しては同等の REQ が自動的に送信されます。
