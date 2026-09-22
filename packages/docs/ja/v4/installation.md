# Installation

rx-nostr 本体、型定義、暗号実装をインストールします。

::: code-group

```sh [pnpm]
pnpm add rx-nostr @rx-nostr/crypto nostr-typedef
```

```sh [npm]
npm install rx-nostr @rx-nostr/crypto nostr-typedef
```

```sh [yarn]
yarn add rx-nostr @rx-nostr/crypto nostr-typedef
```

:::

`nostr-typedef` は rx-nostr の peer dependency です。`@rx-nostr/crypto` は必須ではありませんが、通常は同パッケージの `SimpleVerifier` と `SeckeySigner` を利用できます。

## Browser

ブラウザでは、通常は `globalThis.WebSocket` がそのまま使われます。署名を NIP-07 provider に任せる場合、既定の `Nip07Signer` を利用できるため signer の指定は不要です。

```ts
import { RxNostr } from "rx-nostr";
import { SimpleVerifier } from "@rx-nostr/crypto";

const rxNostr = new RxNostr({
  verifier: new SimpleVerifier(),
});
```

`verifier` は必須です。意図的に署名検証を省略する場合も、`new NoopVerifier()` を明示してください。

## Node.js

`globalThis.WebSocket` がない runtime では、WebSocket constructor を `WebSocket` optionへ渡します。

```sh
pnpm add ws
pnpm add -D @types/ws
```

```ts
import { RxNostr } from "rx-nostr";
import { SimpleVerifier } from "@rx-nostr/crypto";
import WebSocket from "ws";

const rxNostr = new RxNostr({
  verifier: new SimpleVerifier(),
  WebSocket,
});
```

`WebSocket` option は rx-nostr 独自の構造的な型を受け取ります。内部 transport の型を import する必要はありません。

## Runtime と module format

rx-nostr v4 は ESM package として配布されます。JavaScript と TypeScript のいずれからも package root を importしてください。

```ts
import { RxNostr } from "rx-nostr";
```
