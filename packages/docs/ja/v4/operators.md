# Operators

rx-nostr は `EventPacket`、`ReqPacket`、一般的な RxJS stream のための operator を `rx-nostr/operators` から公開しています。query の Observable や `RxReq` の `pipe()` に渡して利用します。

| 対象 | リファレンス |
| --- | --- |
| EVENT の絞り込み・重複排除・整列 | [EventPacket Operators](./event-packet-operators) |
| REQ の結合・分割 | [ReqPacket Operators](./req-packet-operators) |
| OK の EVENT ID による絞り込み | [OkPacket Operators](./ok-packet-operators) |
| packet の type による絞り込み | [MessagePacket Operators](./message-packet-operators) |
| 非同期 filter・整列・差分 | [General Operators](./general-operators) |

## Operator instance の所有権

`createUniq()` / `createTie()` など create 系を除き、operator は各 `pipe()` の中で個別に作ってください。同じ operator instance を異なる stream に共有したり、再購読時に新しい状態へ戻ることを期待したりしないでください。`sort()` / `sortEvents()` の buffer、`tie()` の memo、`setDiff()` の比較状態は factory の呼び出しに属します。

```ts
const first$ = firstSource$.pipe(sortEvents(50));
const second$ = secondSource$.pipe(sortEvents(50));
```

create 系の cache / memo は返された operator に属し、明示的に共有・消去できます。RxJS の `distinct` / `scan` などに委譲する operator は RxJS 由来の購読状態を持ちますが、instance 再利用時の共通保証ではありません。

`filterAsync()` と `verify()` は非同期処理の解決順で通知し、入力順を保証しません。source の完了後も進行中の検証が終わるまで待機します。unsubscribe 後の検証結果は通知しません。
