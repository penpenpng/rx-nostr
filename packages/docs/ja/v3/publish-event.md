# Publish EVENT

`RxNostr` の `send()` メソッドを通じて EVENT メッセージを送信することができます。

`send()` の引数は `kind` と `content` のみが必須で残りが省略可能な event オブジェクトです。
引数に渡されたオブジェクトは、`createRxNostr()` のオプションで指定された `signer` によって署名され、適切なリレーに送信されます。`signer` について詳しくは [Signer](./signer) を参照してください。

```ts:line-numbers
import { createRxNostr, seckeySigner } from "rx-nostr";

const rxNostr = createRxNostr({
  signer: seckeySigner("nsec1..."),
});
rxNostr.setDefaultRelays(["wss://nostr.example.com"]);

rxNostr.send({
  kind: 1,
  content: "Hello, Nostr!",
});
```

::: tip Note
`signer` は `send()` の第二引数で渡すこともできます。`signer` が両方で指定された場合は `send()` の引数として渡された `signer` が優先的に使用されます。
:::

## Handling OK Messages

`send()` の返り値は `subscribe()` 可能なオブジェクトです。これを `subscribe()` することで、OK メッセージを待ち受けることができます。

```ts
rxNostr.send(event).subscribe((packet) => {
  console.log(
    `リレー ${packet.from} への送信が ${packet.ok ? "成功" : "失敗"} しました。`,
  );
});
```

OK メッセージの結果に興味がない場合は `subscribe()` する必要はありません。`subscribe()` の結果を `unsubscribe()` すると、まだ送信に成功していないリレーへの再送信が中止されます。

::: warning
EVENT 送信の過程で [NIP-42](https://github.com/nostr-protocol/nips/blob/master/42.md) に基づく AUTH を求められた場合、rx-nostr は AUTH の後に EVENT メッセージを自動で再送します。このシナリオでは同一のリレーから 2 つの OK メッセージを受け取りうることに注意してください。あるリレーから OK メッセージを受け取ったとき、2 回目の OK メッセージが届きうるかを確かめるには `packet.done` が `false` であることを確認します。
:::

::: tip RxJS Tips
`send()` の返り値は厳密には Observable です。この Observable は OK メッセージがこれ以上届き得ないと判断された時点で complete します。また、まだ OK メッセージが届き得るにも関わらず何も届かないまま 30 秒が経過した場合にも complete します。この挙動は `createRxNostr()` の `okTimeout` オプションや `send()` の `completeOn` オプションによって調整できます。
:::

## cast()

`cast()` は `send()` とほとんど同じですが、いずれかひとつのリレーにイベントが届けられたことが確認でき次第解決される `Promise<void>` を返します。

::: warning
`cast()` が呼び出された時点で接続済みであるすべてのリレーに対しては少なくとも1回の送信試行が保証されますが、そうでないリレーに対しては Promise の解決以降に送信が試行される保証はありません。

いずれかひとつのリレーに送信が成功していればいいような特定の状況でのみ `cast()` を使用してください。
:::
