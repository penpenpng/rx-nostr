# Installation

You can install rx-nostr from npm or yarn as follows:

::: code-group

```sh [npm]
npm install rx-nostr @rx-nostr/crypto
```

```sh [yarn]
yarn add rx-nostr @rx-nostr/crypto
```

:::

@rx-nostr/crypto is a crypto library needed to sign and verify. In practice, the installation is completely optional because you can use any crypto library you like, but this should be sufficient for most use cases.

Select a library that best suits your purpose, such as using wasm's cryptographic library if speed is particularly important.

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
