# Getting Started

rx-nostr の構造を理解するためには中心となる 3 種類の登場人物について知る必要があります。 それは`RxReq`, `RxNostr` とあなたのアプリケーションです。rx-nostr の世界ではこれら 3 種類の登場人物の間を `RxReq -> RxNostr -> Your Application` の単方向に **Packet** と呼ばれるデータが流れます。実際のコードを見る前に、まずは `RxReq` と `RxNostr` が一体何者であるのかを確認しましょう。

## RxReq

`RxReq` は [REQ メッセージ](https://github.com/nostr-protocol/nips/blob/master/01.md#from-client-to-relay-sending-events-and-creating-subscriptions) を組み立てるために必要な情報 (**`ReqPacket`**) を `RxNostr` に送出するオブジェクトです。あなたは `RxReq` が提供するインターフェースを通じて、間接的に REQ を発行することができます。ここで、`RxReq` はあくまで REQ メッセージに必要な情報を提供するだけで、リレーとの交信を行うのは次に説明する `RxNostr` の役目であることに注意してください。

::: tip Note
`RxReq` は `createRxForwardReq()` か `createRxBackwardReq()` によって生成します。
両者の違いは [Subscribe EVENT](./subscribe-event) を参照してください。
:::

## RxNostr

`RxNostr` は受け取った `ReqPacket` をもとにリレーとの間に REQ サブスクリプションを確立し、これを管理するオブジェクトです。あなたは `RxNostr` が提供するインターフェースを通じて、EVENT メッセージをはじめとしたリレーからもたらされる各種の情報を Packet として受け取ることができます。

なお、`RxNostr` はひとつのリレープールと関連づいています。言い換えると、同じ `RxNostr` インスタンスの上では同一のリレーとの通信はすべてひとつの WebSocket 接続にまとめあげられ、逆に、異なるインスタンスの間では同一リレーに対しても異なる WebSocket 接続が確立されるということです。

::: tip Note
`RxNostr` は `createRxNostr()` によって生成します。
:::

## First Example

全体の流れを眺めたところで、早速最小の Nostr アプリケーションを構築してみましょう！まずは `RxNostr` オブジェクトを生成して、リレープールと関連付けます。
このとき `verifier` が必須のパラメータであることに注意してください。
ほとんどの場合、@rx-nostr/crypto が公開している `verifier` を使えば十分ですが、より高度なカスタマイズが必要な場合は [Verifier](./verifier) を参照してください。

```ts:line-numbers
import { createRxNostr } from "rx-nostr";
import { verifier } from "@rx-nostr/crypto";

const rxNostr = createRxNostr({ verifier });
rxNostr.setDefaultRelays([
  "wss://relay1.example.com",
  "wss://relay2.example.com",
]);
```

次に `RxReq` オブジェクトを生成して、`RxNostr` と関連付けます。これで `RxReq` から `RxNostr` に `ReqPacket` を送出する準備が整いました。

```ts:line-numbers{10-12}
import { createRxNostr, createRxForwardReq } from "rx-nostr";
import { verifier } from "@rx-nostr/crypto";

const rxNostr = createRxNostr();
rxNostr.setDefaultRelays([
  "wss://relay1.example.com",
  "wss://relay2.example.com",
]);

const rxReq = createRxForwardReq();

rxNostr.use(rxReq);
```

`rxNostr.use()` の返り値は `subscribe()` 可能なオブジェクトです。REQ の結果として得られる **`EventPacket`** をここで受け取ることができます。つまり、以下のハイライト部分が `RxReq -> RxNostr -> Your Application` フローにおける `Your Application` 相当の部分です。

```ts:line-numbers{13-14}
import { createRxNostr, createRxForwardReq } from "rx-nostr";
import { verifier } from "@rx-nostr/crypto";

const rxNostr = createRxNostr();
rxNostr.setDefaultRelays([
  "wss://relay1.example.com",
  "wss://relay2.example.com",
]);

const rxReq = createRxForwardReq();

rxNostr.use(rxReq).subscribe((packet) => {
  // これがあなたのアプリケーションです！
  console.log(packet);
});
```

::: tip RxJS Tips
`use()` の返り値は厳密には RxJS の [`Observable`](https://rxjs.dev/guide/observable) ですが、それについて知っておくことは必須ではありません。しかし、RxJS に親しんでいる開発者であれば RxJS の資産との連携が可能です。
:::

しかしこのアプリケーションはまだ何も仕事をしないでしょう。なぜなら Packet が流れてこないからです。そう、`ReqPacket` を送出しなければなりませんね。

```ts:line-numbers{17-18}
import { createRxNostr, createRxForwardReq } from "rx-nostr";
import { verifier } from "@rx-nostr/crypto";

const rxNostr = createRxNostr();
rxNostr.setDefaultRelays([
  "wss://relay1.example.com",
  "wss://relay2.example.com",
]);

const rxReq = createRxForwardReq();

rxNostr.use(rxReq).subscribe((packet) => {
  // これがあなたのアプリケーションです！
  console.log(packet);
});

// kind1 event を待ち受けるために REQ メッセージを発行します。
rxReq.emit({ kinds: [1] });
```

17, 18 行目を追加しました。さほど不思議なコードではないはずです。
これによって、`RxReq` は `RxNostr` に向かって `ReqPacket` をひとつ送出します。`RxNostr` は受け取った Packet をもとに REQ サブスクリプションを確立・購読し、購読されたイベントが 13 行目で消費されることになるでしょう。おめでとうございます！タイムラインを表示するアプリケーションの完成です！

ただ、最後にひと仕事だけ残っています。このままでは購読は永遠に続くので、CLOSE メッセージを送出しなければなりません。

rx-nostr では `subscribe()` の結果を `unsubscribe()` することによって、`use()` で関連づいている REQ をすべて CLOSE することができます。少し不格好ですがここでは 10 秒後に CLOSE する、ということにしましょう。次のようにコードを追加します。

```js:line-numbers{12,20-23}
import { createRxNostr, createRxForwardReq } from "rx-nostr";
import { verifier } from "@rx-nostr/crypto";

const rxNostr = createRxNostr();
rxNostr.setDefaultRelays([
  "wss://relay1.example.com",
  "wss://relay2.example.com",
]);

const rxReq = createRxForwardReq();

const subscription = rxNostr.use(rxReq).subscribe((packet) => {
  // これがあなたのアプリケーションです！
  console.log(packet);
});

// kind1 event を待ち受けるために REQ メッセージを発行します。
rxReq.emit({ kinds: [1] });

// 10 秒後に CLOSE メッセージを送信します。
setTimeout(() => {
  subscription.unsubscribe();
}, 10 * 1000);
```

完璧です！
