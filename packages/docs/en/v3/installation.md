# Installation

You can install rx-nostr from npm or yarn as follows:

::: code-group

```sh [npm]
npm install rx-nostr
```

```sh [yarn]
yarn add rx-nostr
```

:::

::: tip Note
When using rx-nostr on runtimes such as Node.js where the `WebSocket` constructor does not exist in the top-level scope, the `WebSocket` constructor must be passed to `createRxNostr()`. The following is an example of using the WebSocket implementation with [ws](https://github.com/websockets/ws) in Node.js

```ts
import { createRxNostr } from "rx-nostr";
import WebSocket from "ws";

const rxNostr = createRxNostr({
  websocketCtor: WebSocket,
});
```

:::
