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

dispose は需要・購読・timer の終了を同期的に始めます。WebSocket の close handshake の確認まで同期的に待つ API ではありません。

## RxJS Subscription

query の購読が不要になったら unsubscribe してください。active REQ には必要に応じて Nostr CLOSE が送られます。

```ts
const subscription = rxNostr
  .forward(relays, filters)
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

`RxReq`、`RxRelays` とその派生集合も dispose できます。

```ts
request.dispose();
relays.dispose();
```

`RxReq.dispose()` は source の完了を通知します。`backward()` の進行中・queue 中の segment は終わるまで継続し、`forward()` の最後の segment は継続します。通信を即時に止めるには query の subscription を unsubscribe してください。

`RxReq.pipe()` で作った派生 request の dispose は、その派生と子孫の observer・operator だけを終了します。親や兄弟の request は継続します。親の dispose は派生にも伝わります。

## 完了通知と所有者

| 通知・操作 | 所有者と確定する時点 |
| --- | --- |
| `Publication.event` | publication の signer が EVENT を返した時。送信完了や OK 受理を表さず、取消後に署名が完了しても resolve し得る |
| legacy `cast()` の完了 | legacy facade が宛先の少なくとも 1 リレーへ EVENT を実際に送信した時。署名だけでは完了しない |
| `Publication.waitFor("any" / "all")` | publication が各宛先の結果から指定の成功条件を判定した時。ほかの送信や linger は継続し得る |
| `Publication.subscribe()` の complete | publication の全 relay effort が終わった時、または取消時。observer の unsubscribe は自身の観測だけを終了 |
| `RxReq.dispose()` | source（または派生 view）からの新しい filter 通知を終了。forward の最後の segment、backward の処理中・queue 中の segment は継続 |
| query の subscription unsubscribe | その query の通信需要と protocol 作業を終了。必要なら CLOSE を送る |
| 内部 `PublicationOperation.closed` | linger 後の lease 解放と cleanup、または cancel による即時 cleanup が済んだ時。公開の成功通知ではない |

operation は relay ごとの需要 lease を、executor は REQ / EVENT / AUTH を含む protocol 作業を、transport は接続・再接続・close を所有します。通常終了では relay ごとの需要が設定された `linger` を経て解放されます。`cancel()` / root の `dispose()` は残りの作業と linger を即時終了します。close handshake 自体は非同期です。

## Worker verifier

`VerificationClient.dispose()` は listener、timer、Worker を終了し、進行中の `verifyEvent()` の Promise を reject します。dispose は冪等で、以後の検証には再利用できません。

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
