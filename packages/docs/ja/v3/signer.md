# Signer

Signer は `createRxNostr()` のオプションか `rxNostr.send()` のオプションとして指定することができる署名器です。
署名器はイベントの本質的な内容 (`kind`, `content`, `tags`) からプロトコル上必要な残りの部分を計算して補完するために利用されます。
`nip07Signer()`, `seckeySigner()`, `noopSigner()`, Custom Signer のいずれかを使用できます。

デフォルトの Signer は `nip07Signer()` です。

## nip07Signer()

`nip07Signer()` は ランタイムから [NIP-07](https://github.com/nostr-protocol/nips/blob/master/07.md) インターフェースを探し、それを利用して必要な値を計算します。

`tags` オプションを指定すると、`tags` フィールドの末尾に与えられたタグを常に付加します。

```ts
import { nip07Signer } from "rx-nostr";
```

## seckeySigner()

`seckeySigner()` は秘密鍵を用いて必要な値を計算します。
秘密鍵は nsec 形式と hex 形式のいずれも使用できます。
この Signer は @rx-nostr/crypto パッケージで公開されています。

`tags` オプションを指定すると、`tags` フィールドの末尾に与えられたタグを常に付加します。

```ts
import { seckeySigner } from "@rx-nostr/crypto";

const signer = seckeySigner("nsec1...");
```

## noopSigner()

`noopSigner()` は何もしません。
与えられたイベントをそのまま送信します。

```ts
import { noopSigner } from "rx-nostr";
```

## Custom Signer

下記の `EventSigner` インターフェースを実装することで任意の Signer を作成できます。

```ts
import * as Nostr from "nostr-typedef";

interface EventSigner {
  signEvent<K extends number>(
    params: Nostr.EventParameters<K>,
  ): Promise<Nostr.Event<K>>;
  getPublicKey(): Promise<string>;
}
```

Signer を実装する場合は以下の規約を守ることを推奨します:

- 与えられたパラメータからイベントを作成する以外の副作用を持たない。
- 計算可能かつ省略可能なパラメータ (`id`, `sig`, `pubkey`, `created_at`) が与えられた場合、例えそれが不正なパラメータであったとしても与えられたパラメータを尊重してイベントを作成する。または、不正なパラメータであった場合は例外を発生させる。

この規約を遵守することによって、開発者が実際に送信されるイベントオブジェクトの `id` や `pubkey` に興味がある場合に、Signer を使ってイベントオブジェクトを事前計算することができます。

rx-nostr と @rx-nostr/crypto が提供する Signer はすべてこの規約を遵守しているため、以下のようにイベントを事前計算することができます:

```ts
import { createRxNostr } from "rx-nostr";
import { seckeySigner } from "@rx-nostr/crypto";

const signer = seckeySigner("nsec1...");

const rxNostr = createRxNostr({ signer });
rxNostr.setDefaultRelays(["wss://nostr.example.com"]);

const eventParams = {
  kind: 1,
  content: "Hello, Nostr!",
};
const event = await signer.signEvent(eventParams);

console.log(`今からイベント ${event.id} を送信します。`);

rxNostr.send(event);
```
