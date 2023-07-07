# REQ Strategy

**REQ Strategy** は `RxNostr` が `ReqPacket` をどのように取り扱うか、または `EventPacket` をどのように発行するかを定める読み取り専用の値で、`RxReq` オブジェクトごとに割り当てられています。`rxNostr.use(rxReq)` が呼び出された際に `RxNostr` は `rxReq.strategy` を読み取り、その値に応じて REQ の戦略を決定します。

::: tip Note
NIP-01 に定義される [Subscription](https://github.com/nostr-protocol/nips/blob/master/01.md#from-client-to-relay-sending-events-and-creating-subscriptions) と RxJS 上の概念としての [Subscription](https://rxjs.dev/guide/subscription) の混同を防ぐため、本ドキュメントではそれぞれを **REQ サブスクリプション** / **Rx サブスクリプション** と表記することがあります。
:::

## Forward Strategy

Forward Strategy はこれから発行されるであろう未来のイベントを待ち受けるための戦略です。`createRxForwardReq()` によって生成された `RxReq` がこの戦略に基づきます。この戦略のもとでは

- 各 `ReqPacket` はすべて同じ subId を持つ REQ サブスクリプションを確立します。つまり、古い REQ サブスクリプションは上書きされ、常にひとつ以下の REQ サブスクリプションを保持します。
- Rx サブスクリプションが明示的に `unsubscribe()` されるまで、REQ サブスクリプションは CLOSE されません。

::: tip
過去のイベントの重複した取得を避けるため、2 回目以降に送出する `ReqPacket` は `since` や `limit` を調整すると良いでしょう。
:::

## Backward Strategy

Backward Strategy は既に発行された過去のイベントを取得するための戦略です。`createRxBackwardReq()` によって生成された `RxReq` がこの戦略に基づきます。この戦略のもとでは

- 各 `ReqPacket` は互いに異なる subId を持つ REQ サブスクリプションを確立します。
- REQ サブスクリプションは次のいずれかの場合に CLOSE されます。
  - EOSE message を受け取る。
  - EVENT message を受け取れない状態が一定時間継続する。
  - Rx サブスクリプションが明示的に `unsubscribe()` する。

::: warning
Backward Strategy はすべての REQ が有限のイベントを返すことを期待して動作するため、`ReqPacket` は未来のイベントを捕捉しないよう `until` などを工夫するべきです。

さもなければ、稀ですが、リレーが EOSE message をサポートしていない場合、Rx サブスクリプションが明示的に `unsubscribe()` されるまで REQ サブスクリプションが残り続ける可能性があります。
:::

## Oneshot Strategy

Oneshot Strategy は Backward Strategy と同じく既に発行された過去のイベントを取得するための戦略ですが、`ReqPacket` をひとつしか送出することができません。その代わり、最初の REQ サブスクリプションが CLOSE したとき Observable が complete します。 `rxNostr.use(rxReq)` が返す `Observable<EventPacket>` が (`rxNostr.dispose()` が呼ばれる以外の理由で) complete する戦略はこれだけです。この戦略は必要なデータの読み込みが完了したときに何かを実行したい場合に便利です。

`createRxOneshotReq()` によって生成された `RxReq` がこの戦略に基づきます。
