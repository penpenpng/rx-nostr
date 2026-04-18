# Installation

npm または yarn から以下の通りインストールできます。

::: code-group

```sh [npm]
npm install rx-nostr
```

```sh [yarn]
yarn add rx-nostr
```

:::

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
