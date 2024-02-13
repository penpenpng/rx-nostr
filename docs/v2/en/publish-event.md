# Publish EVENT

`RxNostr` の `send()` メソッドを通じて EVENT メッセージを送信することができます。

`send()` の第一引数は `kind` と `content` のみが必須で残りが省略可能な event オブジェクトです。指定されたパラメータは指定された値が (たとえ不正な値だったとしても) 尊重されます。一方、指定されなかったパラメータは、特に `pubkey`, `id`, `sig` が `signer` によって計算されます。

`signer` は `createRxNostr()` のオプションか、`send()` の第二引数で渡すことができる署名器です。`signer` が両方で指定された場合は `send()` の第二引数に渡したものが使われます。通常の利用では `createRxNostr()` のオプションに渡しておくのがいいでしょう。

```ts:line-numbers
import { createRxNostr, seckeySigner } from "rx-nostr";

const rxNostr = createRxNostr({
  // nsec1... 形式と HEX 形式のどちらを渡しても動作します。
  signer: seckeySigner("nsec1..."),
});
rxNostr.setDefaultRelays(["wss://nostr.example.com"]);

rxNostr.send({
  kind: 1,
  content: "Hello, Nostr!",
});
```

::: tip Note
デフォルトの `signer` は `nip07Signer()` です。これはランタイムから [NIP-07](https://github.com/nostr-protocol/nips/blob/master/07.md) インターフェースを探し、それを利用して必要な値を計算します。
:::

実際に送信される event オブジェクトの `id` や `pubkey` に興味がある場合もあるかもしれません。そのときは `signer` を使って自分で計算することもできます。

```ts:line-numbers
import { createRxNostr, seckeySigner } from "rx-nostr";

const signer = seckeySigner("nsec1...");

const rxNostr = createRxNostr({
  signer,
});
rxNostr.setDefaultRelays(["wss://nostr.example.com"]);

const eventParams = {
  kind: 1,
  content: "Hello, Nostr!",
};
const event = await signer.signEvent(eventParams);

rxNostr.send(event);

const id = event.id;
// event.pubkey と同じ値になります。
const pubkey = await signer.getPublicKey();

console.log(`${pubkey} は ${id} を送信しました。`);
```

## Handling OK Messages

`send()` の返り値は `subscribe()` 可能なオブジェクトです。これを `subscribe()` することで、OK message を待ち受けることができます。

```ts
rxNostr.send(event).subscribe((packet) => {
  console.log(
    `リレー ${packet.from} への送信が ${packet.ok ? "成功" : "失敗"} しました。`
  );
});
```

::: warning
EVENT 送信の過程で [NIP-42](https://github.com/nostr-protocol/nips/blob/master/42.md) に基づく AUTH を求められた場合、rx-nostr は AUTH の後に EVENT を自動で再送します。このシナリオでは同一のリレーから 2 つの OK message を受け取りうることに注意してください。あるリレーから OK message を受け取ったとき、2 回目の OK message が届きうるかを確かめるには `packet.done` が `false` であることを確認します。
:::

::: tip RxJS Tips
`send()` の返り値は厳密には Observable です。この Observable は OK message がこれ以上届き得ないと判断された時点で complete します。また、まだ OK message が届き得るにも関わらず何も届かないまま 30 秒が経過したときには error で終了します。この待ち時間は `createRxNostr()` の `okTimeout` オプションで変更できます。
:::
