# Subscribe EVENT

`RxNostr` の `use()` メソッドを通じて EVENT メッセージを購読することができます。

[Getting Started](./getting-started) で具体的なコードとともに確認したように、EVENT メッセージ購読までの大まかな流れは次の通りです:

1. `createRxNostr()` で `RxNostr` オブジェクトを得る
2. `createRxForwardReq()` または `createRxBackwardReq()` で `RxReq` オブジェクトを得る
3. `rxNostr.use(rxReq).subscribe(callback)` で EVENT メッセージ受信時の処理を登録しつつ、`Subscription` オブジェクトを得る
4. `rxReq.emit(filter)` で REQ メッセージを発行する
5. 購読が不要になったら `subscription.unsubscribe()` して購読を終了する

ここで重要なのは、手順2. で `createRxForwardReq()` と `createRxBackwardReq()` のどちらを選択するかという点です。
`createRxForwardReq()` が生成する `RxReq` は **Forward Strategy** 、`createRxBackwardReq()` が生成する `RxReq` は **Backward Strategy** と呼ばれる戦略に従って REQ を発行します。

端的に言えば、両者の違いは取得したいイベントが未来のイベントであるか、過去のイベントであるかという点に集約されます。
過去のイベントも未来のイベントも取得したいケースでは、Forward Strategy でのクエリを工夫するか、Forward Strategy と Backward Strategy に分けて取得してください。

::: tip Note
NIP-01 に定義される [Subscription](https://github.com/nostr-protocol/nips/blob/master/01.md#from-client-to-relay-sending-events-and-creating-subscriptions) と `rxNostr.use()` が返す `unsubscribe()` 可能なオブジェクトという意味での `Subscription` との混同を防ぐため、本ドキュメントではそれぞれを **REQ サブスクリプション** / **Rx サブスクリプション** と表記することがあります。実際、後者は RxJS における [`Subscription`](https://rxjs.dev/guide/subscription) と厳密に一致します。
:::

## Forward Strategy

Forward Strategy はこれから発行されるであろう未来のイベントを待ち受けるための戦略です。`createRxForwardReq()` によって生成された `RxReq` がこの戦略に基づきます。この戦略のもとでは

- 各 `ReqPacket` はすべて同じ subId を持つ REQ サブスクリプションを確立します。つまり、古い REQ サブスクリプションは上書きされ、**常にひとつ以下の REQ サブスクリプションを保持します。**
- REQ サブスクリプションは次のいずれかの場合に CLOSE されます。
  - Rx サブスクリプションが明示的に `unsubscribe()` される。
  - AUTH 要求以外の理由で CLOSED メッセージを受け取る。
  - `RxNostr` が明示的に `dispose()` される。

::: tip Note
過去のイベントの重複した取得を避けるため、2 回目以降に送出する `ReqPacket` は `since` や `limit` を調整すると良いでしょう。
:::

## Backward Strategy

Backward Strategy は既に発行された過去のイベントを取得するための戦略です。`createRxBackwardReq()` によって生成された `RxReq` がこの戦略に基づきます。この戦略のもとでは

- 各 `ReqPacket` は互いに異なる subId を持つ REQ サブスクリプションを確立します。つまり、**複数の REQ サブスクリプションが同時に並行する可能性があります。**
- REQ サブスクリプションは次のいずれかの場合に CLOSE されます。
  - **EOSE メッセージを受け取る。**
  - **EVENT メッセージを受け取れない状態が一定時間継続する。**
  - Rx サブスクリプションが明示的に `unsubscribe()` される。
  - AUTH 要求以外の理由で CLOSED メッセージを受け取る。
  - `RxNostr` が明示的に `dispose()` される。

::: warning
Backward Strategy はすべての REQ が EOSE を返すことを期待して動作するため、`ReqPacket` は未来のイベントを捕捉しないよう `until` などを工夫するべきです。

さもなければ、Rx サブスクリプションが明示的に `unsubscribe()` されるまで REQ サブスクリプションが残り続ける可能性があります。
:::

::: tip Note
デフォルトでは EVENT メッセージ が受け取れない状態が 30 秒継続したときに CLOSE されます。この時間は `createRxNostr()` の `eoseTimeout` オプションで変更できます。
:::

### over()

Backward Strategy に基づいて複数の REQ を発行するとき、それらすべての REQ の完了を待つことができると便利な場合があります。`rxReq.over()` はそのような場合に Backward Strategy でのみ利用できる機能です。

`rxReq.over()` は同 `rxReq` の上でこれ以上 `rxReq.emit()` が呼ばれないことを rx-nostr に伝えます。`rxReq.over()` が呼び出されたあと、すでに送出されたすべての `ReqPacket` に関連する EOSE が確認されたときに、`rxNostr.use()` は**完了**します (すでにすべての EOSE が確認されているならば直ちに完了します)。完了時の処理は以下のようにして登録できます:

```ts
const rxReq = createRxBackwardReq();

rxNostr.use(rxReq).subscribe({
  next: (packet) => {
    console.log("Received:", packet);
  },
  complete: () => {
    console.log("Completed!");
  },
});

rxReq.emit({ ids: ["..."] });
rxReq.emit({ ids: ["..."] });

rxReq.over();
```

::: tip RxJS Tips
ここでの **完了** とは RxJS における Observable の complete とまったく同一の概念です。Forward Strategy に基づく Observable が complete することは (`RxNostr` が `dispose()` された場合を除いて) ありません。
:::

## REQ Queue

通常、リレーには同時並行できる REQ サブスクリプションの数に上限が設けられており、[NIP-11](https://github.com/nostr-protocol/nips/blob/master/11.md) に基づきその上限設定が公開されます。rx-nostr はこの情報を自動で読み取って、並行数の制限を逸脱しないように REQ 要求をキューイングします。

詳しくは [NIP-11 Registry](./nip11-registry) を参照してください。
