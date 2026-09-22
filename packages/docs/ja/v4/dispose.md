# Dispose

rx-nostr の lifecycle を持つ object は `dispose()` と `Symbol.dispose` に対応します。使い終えた object は明示的に破棄してください。

## `RxNostr`

```ts
rxNostr.dispose();
```

dispose は次を行います。

1. 新しい operation の受付を停止する
2. active query を complete する
3. active publication を cancel する
4. hot relay の connection demand を解放する
5. retry、timeout、AUTH、WebSocket、listener を終了する
6. connection state observer へ `disposed` を通知して complete する

dispose は冪等です。複数回呼んでも構いません。dispose 後に mutator または publish を呼ぶと `RxNostrAlreadyDisposedError` が throw されます。dispose 後に cold query を subscribe した場合は Observable の error として通知されます。

## RxJS Subscription

query の購読が不要になったら unsubscribe してください。active REQ には必要に応じて Nostr CLOSE が送られます。

```ts
const subscription = rxNostr
  .req(relays, { strategy: "forward", filters })
  .subscribe(onEvent);

subscription.unsubscribe();
```

unsubscribe は、その query の観測と通信を終了します。

一方、`Publication.subscribe()` の Subscription は OK の観測だけを所有します。unsubscribe しても publication 自体は継続します。

```ts
const publication = rxNostr.publish(relays, params);
const observer = publication.subscribe(onOk);

observer.unsubscribe();     // 観測だけを終了
publication.cancel();       // 送信努力を終了
```

## `RxReq` と `RxRelays`

`RxForwardReq`、`RxBackwardReq`、`RxRelays` とその派生集合も dispose できます。

```ts
request.dispose();
relays.dispose();
```

`RxBackwardReq.over()` は「これ以上 ReqPacket を emit しない」という正常完了の通知です。即時に破棄する `dispose()` とは用途が異なります。

## Worker verifier

`VerificationClient.dispose()` は listener、timer、Worker を終了します。

```ts
client.dispose();
```

Worker 側の `VerificationHost` も dispose に対応します。

## `using`

Explicit Resource Management を使える環境では scope 終了時に自動で dispose できます。

```ts
{
  using rxNostr = new RxNostr({ verifier });
  using relays = new RxRelays(["wss://relay.example.com"]);

  // ...
}
```
