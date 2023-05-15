# Core Concept

rx-nostr の中心となるのは [`RxNostr`](./api/rx-nostr.md) と [`RxReq`](./api/rx-req.md) の 2 種類のオブジェクトです。`RxNostr` は `RxReq` が提供する [Observable](https://rxjs.dev/guide/observable) を `subscribe()` し、あなたのプログラムは `RxNostr` が提供する Observable を `subscribe()` します。これらの Observable の中を流れるオブジェクトを Packet と呼びます。この関係は概ね次の図で表現できます:

```
[RxReq] --(REQ Packet)--> +-------+ --(EVENT Packet)--> +------------+
[RxReq] --(REQ Packet)--> |RxNostr| --(EVENT Packet)--> |Your Program|
[RxReq] --(REQ Packet)--> +-------+ --(EVENT Packet)--> +------------+
```

この関係は `RxNostr` の `use()` メソッドによって確立され、その戻り値を `subscribe()` することで初めて駆動し、さらにそれを `unsubscribe()` することで解消されます。

```js
const observable = rxNostr.use(rxReq);
const sub = observable.subscribe();
sub.unsubscribe();
```

上で与えられた関係図の中で、`RxNostr` の役割は `RxReq` から受け取った Packet に応じた REQ サブスクリプションを別途与えられたリレーセットの上で確立することと、その REQ サブスクリプションから得られた EVENT を Packet に包んであなたのプログラムに提供することです。典型的なアプリケーションでは `RxNostr` のインスタンスはただひとつ存在することになるでしょう。

一方、`RxReq` の役割は REQ Filter を Packet に包んで `RxNostr` に送信するための `emit()` メソッドを公開することと、`RxNostr` に対して REQ の管理戦略を通知することです。2 つ目の役割で述べた管理戦略のことを Strategy と呼び、Backward Strategy と Forward Strategy の 2 種類が定義されています。

## Backward Strategy

Backward Strategy は既に発行された過去の EVENT を取得するための戦略です。この戦略のもとでは、

- `RxNostr` に対して送信された各 Packet は互いに異なる subId を持つ REQ サブスクリプションを確立します
- 各 REQ サブスクリプションは以下のいずれかの場合に CLOSE されます
  - EOSE に達する
  - 何も EVENT を受けとならない状態が一定時間継続する
  - 明示的に `unsubscribe()` される

Backward Strategy はすべての REQ に「終わり」があることを期待して動作するため、Filter は未来のイベントを捕捉しないように注意して設定する必要があります。さもなければ、特に EOSE をリレーが発行しなかった場合、明示的に CLOSE されるまでサブスクリプションが残り続ける可能性があります。

## Forward Strategy

Forward Strategy はこれから発行されるであろう未来の EVENT を待ち受けるための戦略です。この戦略のもとでは、

- `RxNostr` に対して送信された各 Packet はすべて同じ subId を持つ REQ サブスクリプションを確立します。つまり、古いサブスクリプションは上書きされ、常にひとつ以下のサブスクリプションを保持します。
- REQ サブスクリプションは明示的に `unsubscribe()` まで CLOSE されません

過去のイベントの重複した取得を避けるため、2 回目以降に `emit()` される Filter の `limit` はできるだけ小さくすべきです。
