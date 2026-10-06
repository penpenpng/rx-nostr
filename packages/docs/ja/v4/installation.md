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

REQ を使う場合、`verifier` は instance config または `RxNostr.defaultConfig.verifier` に指定します。省略時の verifier は EVENT の検証時にエラーとなります。意図的に署名検証を省略する場合も、`new NoopVerifier()` を明示してください。

## Node.js

Node.js は **24 以降**をサポートします。Node 24 では下記の JavaScript 標準 API を polyfill なしで利用できます。`WebSocket` がない環境では constructor を注入してください。

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

実行時には `DisposableStack` と `Symbol.dispose`、`Promise.withResolvers`、`Set.prototype.union/intersection/difference`、`Array.prototype.toSorted` が必要です。ブラウザのサポート下限は、これらの API と WebSocket をネイティブに備えるか、不足分をアプリケーションが **rx-nostr の import より先に** polyfill した環境です。`DisposableStack` がない場合、client の生成を待たず module の評価時に import が失敗します。WebSocket の注入だけでは JavaScript API の不足を補えません。NIP-11 の既定取得処理には `fetch` も必要です（`fetcher` option で差し替え可能）。

たとえば `DisposableStack` だけが不足している環境では、次の順で起動できます。

```sh
pnpm add disposablestack
```

```ts
import "disposablestack/auto";

const { RxNostr } = await import("rx-nostr");
const rxNostr = new RxNostr();
rxNostr.dispose();
```

ほかの API が不足する場合も、対応する polyfill を先に読み込んでください。rx-nostr はグローバル polyfill を自動導入しません。上の手順は Node 24 で `DisposableStack` を削除した別プロセスで検証しています。ブラウザごとの互換性は、採用するブラウザと polyfill の組み合わせで確認してください。

CI では Node 24.0.0 と現行 Node 24 の両方で配布 tarball を polyfill なしで import し、`DisposableStack` が不足する場合の失敗と先読み後の回復を別プロセスで検査します。Chrome では配布物から module Worker を起動し、署名検証の通信と終了まで確認します。
