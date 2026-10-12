# Installation

rx-nostr の動作のためには少なくとも `nostr-typedef` が必須です。

また、署名とその検証のための処理は rx-nostr 本体には含まれていません。ほとんどの場合はこれらが必要で、別途導入する必要があります。利用者自身で自由に実装できますが、通常は `@rx-nostr/crypto` で十分なはずです。


::: code-group

```sh [npm]
npm install rx-nostr nostr-typedef @rx-nostr/crypto
```

```sh [pnpm]
pnpm add rx-nostr nostr-typedef @rx-nostr/crypto
```

```sh [yarn]
yarn add rx-nostr nostr-typedef @rx-nostr/crypto
```

:::

rx-nostr は内部で [DisposableStack](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DisposableStack) を利用しています。2026年10月現在、この API のブラウザサポートは限定的なので、クライアントサイドの利用では polyfill の導入をおすすめします。

::: code-group

```sh [npm]
npm install diposablestack
```

```sh [pnpm]
pnpm add diposablestack
```

```sh [yarn]
yarn add diposablestack
```

:::

polyfill は rx-nostr の初回の import よりも先に完了していなければなりません。

```ts
import "disposablestack/auto";

import { RxNostr } from "rx-nostr";
```

## WebSocket

WebSocket 通信のためには、通常は `globalThis.WebSocket` がそのまま使われます。古い Node.js を利用していて `globalThis.WebSocket` が存在しなかったり、何らかの事情で別の WebSocket 実装を使用したい場合は `WebSocket` オプションを設定してください。

```ts
import { RxNostr } from "rx-nostr";
import WebSocket from "ws";

const rxNostr = new RxNostr({
  WebSocket,
});
```

すべての `RxNostr` インスタンスで同様にする場合には代わりに `defaultConfig` が利用できます。

```ts
import { RxNostr } from "rx-nostr";
import WebSocket from "ws";

RxNostr.defaultConfig.WebSocket = WebSocket;
```
