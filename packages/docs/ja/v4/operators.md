# Operators

rx-nostr は `EventPacket`、`ReqPacket`、一般的な RxJS stream のための operator を `rx-nostr/operators` から公開しています。

## EventPacket operator

```ts
rxNostr
  .backward(relays, [{}])
  .pipe(
    filterByKinds([1, 6]),
    uniq(),
    timeline(100),
  )
  .subscribe(renderTimeline);
```

| operator | 内容 |
| --- | --- |
| `filterBy(filter)` | Nostr filter に一致する EVENT だけを通す |
| `filterByKind(kind)` | 指定 kind だけを通す |
| `filterByKinds(kinds)` | 指定した複数 kind だけを通す |
| `filterByPow(difficulty)` | NIP-13 PoW の条件を満たす EVENT だけを通す |
| `dropExpiredEvents()` | NIP-40 で期限切れの EVENT を除外する |
| `verify(verifier)` | verifier が正当と判定した EVENT だけを通す |
| `uniq()` | event ID が重複する packet を除外する |
| `createUniq()` | cache を外部操作できる uniq operator を作る |
| `tie()` | relay ごとの初回観測に `seenOn` と `isNew` を付ける |
| `createTie()` | memo を外部操作できる tie operator を作る |
| `latest()` | 新しい時刻を優先し、同時刻なら ID の辞書順が小さい EVENT を最新として通す |
| `latestEach(key)` | key ごとに同じ規則で最新の EVENT だけを通す |
| `sortEvents(ms)` | 一定時間 buffer して古い時刻順、同時刻なら ID の大きい順に並べる |
| `timeline(limit?)` | 新しい時刻順、同時刻なら ID の小さい順の packet 配列を蓄積して通知する |

`timeline(0)` は各入力で空配列を通知し、`timeline(1)` は最新の1件だけを通知します。`limit` は 0 以上の整数に限られ、不正な値は `RangeError` になります。

多くの filter operator は `{ not: true }` による反転に対応します。

```ts
source$.pipe(filterByKind(1, { not: true }));
```

### `tie()`

同じ event ID を同じ relay から繰り返し受け取った場合は重複を除外し、別の relay で初めて観測した場合は再び通知して観測先を記録します。`isNew` が `true` になるのは、全 relay を通じた最初の通知だけです。

```ts
source$.pipe(tie()).subscribe((packet) => {
  console.log(packet.isNew, packet.seenOn);
});
```

`seenOn` は、その packet を通知する時点までに観測した relay の集合です。

## ReqPacket operator

`RxReq` は `pipe()` で ReqPacket operator を適用できます。

```ts
import { bufferTime } from "rxjs";
import { RxReq } from "rx-nostr";
import { batch } from "rx-nostr/operators";

const source = new RxReq();
const batched = source.pipe(bufferTime(50), batch());

rxNostr.forward(relays, batched).subscribe(console.log);
```

| operator | 内容 |
| --- | --- |
| `batch(merge?)` | ReqPacket の配列を relay 集合ごとにまとめる |
| `chunk(predicate, split)` | 大きな filter 集合を複数 ReqPacket に分割する |

`batch()` は正規化した relay URL 集合ごとに filter を結合します。`RxRelays` は同じ内容でも別 instance なら別 group です。group の `relays`、`traceTag`、`linger` などの option は先頭 packet の値を採用し、既定の filter 結合は入力順の連結です。独自の merge 関数は各 filter 配列を順に畳み込みます。空の配列からは packet を出しません。

固定の relay 配列・Set は group 化時に配列へ snapshot します。generator は宛先に指定できません。動的な `RxRelays` は同じ instance を保持します。

`chunk()` は predicate が false なら元 packet を通し、true なら split が返した filter 配列ごとに packet を出します。`relays`、`traceTag`、`linger` は各 packet へ保持され、空の split 結果は packet を出しません。predicate / split が投げた例外は stream の error になります。

## Packet utility

| operator | 内容 |
| --- | --- |
| `filterByType(type)` | `type` discriminant で packet を絞り込み、型も narrow する |
| `filterByEventId(id)` | 指定 EVENT ID の `OkPacket` だけを通す |

## General operator

| operator | 内容 |
| --- | --- |
| `filterAsync(predicate)` | 非同期 predicate で値を絞り込む |
| `sort(ms, compare)` | 一定時間 buffer して任意の順序に並べる |
| `setDiff()` | `Set` の追加、削除、現在値を通知する |
| `timeoutWith(value?)` | RxJS `TimeoutError` を complete または指定値へ変換する |
| `withPrevious()` | `[ひとつ前の値, 現在値]` を通知する |

`timeoutWith(value)` は `TimeoutError` のとき指定値を1件通知して complete します。`0`、`false`、空文字も指定値として通知します。引数を省略すると値を出さずに complete し、timeout 以外の error はそのまま伝えます。

`setDiff({ seed })` は初期 Set を呼び出し時に snapshot し、その operator instance が比較状態を保持します。入力 Set や通知された `current` をあとから変更しても、内部の比較状態は変わりません。

### Operator instance の所有権

`createUniq()` / `createTie()` など create 系を除き、operator は各 `pipe()` の中で個別に作ってください。同じ operator instance を異なる stream に共有したり、再購読時に新しい状態へ戻ることを期待したりしないでください。`sort()` / `sortEvents()` の buffer、`tie()` の memo、`setDiff()` の比較状態は factory の呼び出しに属します。

```ts
const first$ = firstSource$.pipe(sortEvents(50));
const second$ = secondSource$.pipe(sortEvents(50));
```

create 系の cache / memo は返された operator に属し、明示的に共有・消去できます。RxJS の `distinct` / `scan` などに委譲する operator は RxJS 由来の購読状態を持ちますが、instance 再利用時の共通保証ではありません。

`filterAsync()` と `verify()` は非同期処理の解決順で通知し、入力順を保証しません。source の完了後も進行中の検証が終わるまで待機します。unsubscribe 後の検証結果は通知しません。
