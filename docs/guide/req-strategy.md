# REQ Strategy

## Forward Strategy
<!--
Forward Strategy はこれから発行されるであろう未来の EVENT を待ち受けるための戦略です。この戦略のもとでは、

- `RxNostr` に対して送信された各 Packet はすべて同じ subId を持つ REQ サブスクリプションを確立します。つまり、古いサブスクリプションは上書きされ、常にひとつ以下のサブスクリプションを保持します。
- REQ サブスクリプションは明示的に `unsubscribe()` まで CLOSE されません

過去のイベントの重複した取得を避けるため、2 回目以降に `emit()` される Filter の `limit` はできるだけ小さくすべきです。 -->


## Backward Strategy

<!-- Backward Strategy は既に発行された過去の EVENT を取得するための戦略です。この戦略のもとでは、

- `RxNostr` に対して送信された各 Packet は互いに異なる subId を持つ REQ サブスクリプションを確立します
- 各 REQ サブスクリプションは以下のいずれかの場合に CLOSE されます
  - EOSE に達する
  - 何も EVENT を受けとならない状態が一定時間継続する
  - 明示的に `unsubscribe()` される

Backward Strategy はすべての REQ に「終わり」があることを期待して動作するため、Filter は未来のイベントを捕捉しないように注意して設定する必要があります。さもなければ、特に EOSE をリレーが発行しなかった場合、明示的に CLOSE されるまでサブスクリプションが残り続ける可能性があります。 -->

## Oneshot Strategy
