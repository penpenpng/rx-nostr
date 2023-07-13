# Sending EVENT

`RxNostr` の `send()` メソッドを通じて、書き込みが許可されているすべてのリレーに対して EVENT メッセージを送信することができます。

`send()` の第一引数は `kind` と `content` のみが必須で残りが省略可能な event オブジェクトで、第二引数は省略可能のオプションで、特に `seckey` オプションに `nsec` 形式または HEX 形式の秘密鍵を指定可能です。省略されたパラメータは NIP-07 インターフェースを用いて自動的に計算されます。逆に、指定されたパラメータは指定された値が (たとえ不正な値だったとしても) 尊重されます。

```js:line-numbers{6-10}
import { createRxNostr } from "rx-nostr";

const rxNostr = createRxNostr();
await rxNostr.switchRelays(["wss://nostr.example.com"]);

// NIP-07 is required because the 2nd positional argument is omitted.
rxNostr.send({
  kind: 1,
  content: "Hello, Nostr!",
});
```

実際に送信される event オブジェクトの内容に興味がある場合もあるかもしれません。そのときは `send()` が内部的に使用している `getSignedEvent()` を直接使用することができます。

```js:line-numbers{6-9,13}
import { createRxNostr, getSignedEvent } from "rx-nostr";

const rxNostr = createRxNostr();
await rxNostr.switchRelays(["wss://nostr.example.com"]);

const event = await getSignedEvent({
  kind: 1,
  content: "Hello, Nostr!",
});

console.log(`${event.id} will be sent.`);

rxNostr.send(event);
```

## Handling OK Messages

`use()` は送信した EVENT に対する OK Message を購読する Observable を返します。Observable は送信先のリレーの数と同じ数の OK Message を受け取ったときに complete、または何もメッセージを受信しないまま 30 秒経過したときに error で終了します。

```js
rxNostr.send(event).subscribe((packet) => {
  console.log(`relay: ${packet.from} -> ${packet.ok ? "succeeded" : "failed"}`);
});
```

## Write on a subset of relays (v1.1.0+)

構成された書き込み可能リレーのうちの一部だけにイベントを送信したい場合、 `scope` オプションにリレーの URL のリストを指定できます。
`scope` オプションに URL を指定しても、指定された URL が構成されていない場合には書き込みは発生しないことに注意してください。
