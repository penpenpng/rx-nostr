# Verifier

Verifier は `createRxNostr()` のオプションか `rxNostr.use()` のオプションとして指定することができる検証器です。
検証器はイベントの署名 (`sig`) の正当性を検証するために利用されます。
`verifier`, `noopVerifier`, Custom Verifier のいずれか、またはそれを WebWorker 上で動作させる Worker Verifier を使用できます。

デフォルトの Verifier はありません。
`createRxNostr()` の `verifier` は必須のパラメータです。
意図的に検証を行わない場合には `noopVerifier` 明示的に指定するか、`skipVerify` オプションを有効化してください。

## verifier

`verifier` は @noble パッケージと @scure パッケージが提供する実装を使用して署名を検証します。
この Verifier は rx-nostr-crypto パッケージで公開されています。

```ts
import { verifier } from "rx-nostr-crypto";
```

## noopVerifier

`noopVerifier()` は何もしません。
与えられたイベントをすべて正当なイベントとみなします。

```ts
import { noopVerifier } from "rx-nostr";
```

## Custom Verifier

下記の `EventVerifier` インターフェースを実装することで任意の Verifier を作成できます。

```ts
import * as Nostr from "nostr-typedef";

interface EventVerifier {
  (params: Nostr.Event): Promise<boolean>;
}
```

Verifier を実装する場合は以下の規約を必ず守ってください:

- 与えられたイベントが正当な場合は `Promise<true>` を返し、不当な場合は `Promise<false>` を返す。
- 与えられたイベントの正当性を検証できなかった場合には例外を発生させる。
- 各イベントに対して1回以上実行されても不都合が生じないように実装する。

## Worker Verifier

署名の検証はしばしば UI スレッドをハングさせる原因になるため、大量のイベントを検証する必要がある場合には検証処理を Worker スレッド上で行うと UI の応答性の改善に効果的です。

`createVerificationServiceClient()` と `startVerificationServiceHost()` を使うと Worker 上で動作する Verifier を以下のように簡単に作成することができます。

worker.ts を Worker で動作させるスクリプトであるとします。
まず、worker.ts を次のように構成し、Worker 上で検証処理を行うサービスを作成します:

```ts
// worker.ts

import { startVerificationServiceHost } from "rx-nostr-crypto";

startVerificationServiceHost();
```

::: tip Note
`startVerificationServiceHost()` の `verifier` オプションに任意の Verifier を渡すことによって、本質的な検証処理を移譲させることができます。
デフォルトでは `verifier` が使われます。
:::

次に、Worker を生成してそれに問い合わせるクライアント `VerificationServiceClient` を UI スレッド上に作成します。
バンドラーとして [vite](https://vitejs.dev) を使用している場合は、[`?worker&url` クエリによるインポート](https://vitejs.dev/guide/features.html#web-workers)が便利です:

```ts
import { createRxNostr } from "rx-nostr";
import { createVerificationServiceClient } from "rx-nostr-crypto";

import workerUrl from "./worker-host?worker&url";

const client = createVerificationServiceClient({
  worker: new Worker(workerUrl, { type: "module" }),
});
client.start();

const rxNostr = createRxNostr({
  verifier: client.verifier,
});

// Verifier を利用する必要がなくなった場合は:
client.dispose();
```

`VerificationServiceClient` が不要になった場合には、Worker を終了させるために `client.dispose()` を呼ぶのを忘れないようにしてください。
標準的な Worker API に基づいて `worker.terminate()` で Worker を終了させても構いません。

::: tip Note
SSR では、サーバーコンテキストに `Worker` が存在しないため `new Worker()` は失敗します。
`createNoopClient()` はサーバーコンテキストでダミーの `VerificationServiceClient` を生成するために使用できます:

```ts
import {
  createVerificationServiceClient,
  createNoopClient,
} from 'rx-nostr-crypto';
import workerUrl from './worker-host?worker&url';

const isBrowser = /* ... */;

using client = isBrowser ?
  createVerificationServiceClient({
    worker: new Worker(workerUrl, { type: 'module' }),
  })
  : createNoopClient();
```

:::
