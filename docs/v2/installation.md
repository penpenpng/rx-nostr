# Installation

npm または yarn から以下の通りインストールできます。

:::: code-group
::: code-group-item npm

```sh
npm install rx-nostr
```

:::
::: code-group-item yarn

```sh
yarn add rx-nostr
```

:::
::::

Node.js など、トップレベルスコープに `WebSocket` コンストラクタが存在しないランタイムで rx-nostr を使用する場合、`RxNostr` に `WebSocket` コンストラクタを渡す必要があります。以下は Node.js で [ws](https://github.com/websockets/ws) による WebSocket 実装を利用する例です:

```sh
npm install rx-nostr ws
```

```ts
import { createRxNostr } from "rx-nostr";
import WebSocket from "ws";

const rxNostr = createRxNostr({
  websocketCtor: WebSocket,
});
```
