# Installation

npm または yarn から以下の通りインストールできます。

::: code-group

```sh [npm]
npm install rx-nostr rx-nostr-crypto
```

```sh [yarn]
yarn add rx-nostr rx-nostr-crypto
```

:::

rx-nostr-crypto は署名やその検証に必要な暗号ライブラリです。実際には暗号ライブラリは好きなものを使用できるのでインストールは完全に任意ですが、ほとんどのユースケースではこちらで十分なはずです。

特に速度が求められる場合は wasm 製の暗号ライブラリを使用するなど、目的に合わせてライブラリを選定してください。

::: tip Note
Node.js など、トップレベルスコープに `WebSocket` コンストラクタが存在しないランタイムで rx-nostr を使用する場合、`createRxNostr()` に `WebSocket` コンストラクタを渡す必要があります。以下は Node.js で [ws](https://github.com/websockets/ws) による WebSocket 実装を利用する例です:

```ts
import { createRxNostr } from "rx-nostr";
import WebSocket from "ws";

const rxNostr = createRxNostr({
  websocketCtor: WebSocket,
});
```

:::
