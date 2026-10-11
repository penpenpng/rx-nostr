# General Operators

| operator | 内容 |
| --- | --- |
| `filterAsync(predicate)` | 非同期 predicate で値を絞り込む |
| `sort(ms, compare)` | 一定時間 buffer して任意の順序に並べる |
| `setDiff()` | `Set` の追加、削除、現在値を通知する |
| `withPrevious()` | `[ひとつ前の値, 現在値]` を通知する |

[[TOC]]

## filterAsync()

`filterAsync(predicate)` は非同期 predicate で値を絞り込みます。`predicate(value, index)` は `Promise<boolean>` を返し、index は0から始まります。各 Promise の解決順で通知し、入力順を保証しません。source の正常完了後も進行中の処理を待ちます。例外・reject は stream の error になり、unsubscribe 後の結果は通知しません。開始済みの Promise 自体を取り消す機能はありません。

## sort()

`sort(bufferTime, compareFn)` は一定時間 buffer して任意の順序に並べます。時間の単位は milliseconds です。比較関数は配列の `sort()` と同様に負数・0・正数を返します。各入力に対応する遅延のあとで、その時点の buffer の先頭を1件通知します。buffer の範囲を超えた全体の整列は保証しません。

## setDiff()

`setDiff(options?)` は `Set<T>` の入力を受け、`SetDiff<T>` を返します。`appended` は追加された値、`outdated` は削除された値、`current` は現在値の Set です。最初の比較対象は空集合、または `options.seed` です。`SetDiff` 型も `rx-nostr/operators` から公開されます。

`setDiff({ seed })` は初期 Set を呼び出し時に snapshot し、その operator instance が比較状態を保持します。入力 Set や通知された `current` をあとから変更しても、内部の比較状態は変わりません。

## withPrevious()

`withPrevious()` は `[ひとつ前の値, 現在値]` を通知します。最初の値に対する通知は `[undefined, 最初の値]` です。

<!-- typecheck-example: operators-general -->
```ts
import { of } from "rxjs";
import {
  filterAsync, sort, setDiff, withPrevious,
} from "rx-nostr/operators";

of(3, 1, 2).pipe(
  filterAsync(async (value) => value > 0),
  sort(50, (a, b) => a - b),
  withPrevious(),
).subscribe(console.log);

of(new Set([1]), new Set([1, 2])).pipe(setDiff()).subscribe(console.log);
```

状態を持つ operator の共有については [Operator instance の所有権](./operators#operator-instance-の所有権) を参照してください。
