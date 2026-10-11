# EventPacket Operators

query が返す `Observable<EventPacket>` に適用できる operator です。すべて `rx-nostr/operators` から import します。多くの filter operator は `{ not: true }` による反転に対応します。

[[TOC]]

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
| `createUniq(keyFn, options?)` | cache を外部操作できる uniq operator を作る |
| `tie()` | relay ごとの初回観測に `seenOn` と `isNew` を付ける |
| `createTie()` | memo を外部操作できる tie operator を作る |
| `latest()` | 新しい時刻を優先し、同時刻なら ID の辞書順が小さい EVENT を最新として通す |
| `latestEach(key)` | key ごとに同じ規則で最新の EVENT だけを通す |
| `sortEvents(ms)` | 一定時間 buffer して古い時刻順、同時刻なら ID の大きい順に並べる |
| `timeline(limit?)` | 新しい時刻順、同時刻なら ID の小さい順の packet 配列を蓄積して通知する |

## filterBy()

`filterBy(filters, options?)` は `LazyFilter` またはその配列に一致する EVENT だけを通します。配列内の filter は OR で結合します。`options.not: true` で結果を反転できます。

`sinceExclusive` / `untilExclusive` は時刻境界を除外する option です。省略時は境界を含みます。lazy な時刻関数は operator を作った時点で評価します。REQ の送信・再送のたびに評価する query の lazy filter とは評価時点が異なります。`limit` は通過するイベント数の上限としては使いません。

## filterByKind()

`filterByKind(kind, options?)` は指定したひとつの kind だけを通します。`options.not: true` はその kind を除外します。

```ts
source$.pipe(filterByKind(1, { not: true }));
```

## filterByKinds()

`filterByKinds(kinds, options?)` は `number[]` に含まれる kind だけを通します。`options.not: true` で反転できます。

## filterByPow()

`filterByPow(difficulty, options?)` は `nonce` tag があり、EVENT ID の先頭ゼロビット数が `difficulty` 以上の EVENT を通します。`requireTargetDifficulty: true` の場合は、`nonce` tag の宣言値を数値に変換し、要求難度より小さければ除外します。`options.not: true` で結果を反転できます。

## dropExpiredEvents()

`dropExpiredEvents(now?)` は NIP-40 の `expiration` tag で期限切れとなった EVENT を除外します。`now` に `Date` を渡すと秒単位へ切り捨てた固定時刻を使い、省略すると各 EVENT の検査時刻を使います。期限と同じ時刻も期限切れです。`expiration` tag がない場合、またはその値が整数として解釈できない場合は通します。

## verify()

`verify(verifier)` は `EventVerifier.verifyEvent()` が `true` を返した EVENT だけを通します。引数には [Verifier](./verifier) の instance を渡します。

非同期検証の解決順で通知するため入力順は保証しません。source の完了後も進行中の検証を待ち、unsubscribe 後の結果は通知しません。verifier の例外・reject は stream の error になります。この operator 自体は `RxNostrCallbackError` へ変換しません。

## uniq()

`uniq(flushes?)` は同じ EVENT ID の最初の packet だけを通します。`flushes` に `ObservableInput` を渡すと、その通知ごとに記録を消去します。

## createUniq()

`createUniq(keyFn, options?)` は `[operator, cache]` を返します。`keyFn(packet)` が返した key を `Set` に記録し、同じ key の packet を除外します。`null` を返した packet は記録せずに通します。`keyFn` は必須です。

`options.onCache(packet, cache)` は新しい key の記録後、`options.onHit(packet, cache)` は重複を検出したときに呼ばれます。返された cache は `clear()` / `delete()` などで操作できます。

<!-- typecheck-example: operators-event-cache -->
```ts
import type { EventPacket } from "rx-nostr";
import { createUniq, createTie } from "rx-nostr/operators";
import type { Observable } from "rxjs";

declare const events$: Observable<EventPacket>;

const [unique, cache] = createUniq((packet: EventPacket) => packet.event.id);
events$.pipe(unique).subscribe(console.log);
cache.clear();

const [tied, memo] = createTie<EventPacket>();
events$.pipe(tied).subscribe(({ seenOn, isNew }) => console.log(seenOn, isNew));
memo.clear();
```

## tie()

同じ event ID を同じ relay から繰り返し受け取った場合は重複を除外し、別の relay で初めて観測した場合は再び通知して観測先を記録します。`isNew` が `true` になるのは、全 relay を通じた最初の通知だけです。

```ts
source$.pipe(tie()).subscribe((packet) => {
  console.log(packet.isNew, packet.seenOn);
});
```

`seenOn` は、その packet を通知する時点までに観測した relay の集合です。

`tie(flushes?)` は `ObservableInput` の通知で memo を消去できます。この通知への購読は `tie()` の呼び出し時に作られるため、query の unsubscribe とは独立しています。`flushes` の寿命は呼び出し側で管理してください。

## createTie()

`createTie()` は `[operator, memo]` を返します。operator は `tie()` と同じく `seenOn: Set<string>` と `isNew: boolean` を packet に追加し、memo は EVENT ID を key、観測先の集合を値とする `Map<string, Set<string>>` です。`memo.clear()` で全記録、`memo.delete(id)` で特定 EVENT の記録を消去できます。

## latest()

`latest()` は新しい `created_at` を優先し、同時刻なら ID の辞書順が小さい EVENT を最新として通します。古い EVENT や同じ ID の重複では通知しません。

## latestEach()

`latestEach(key)` は `key(packet)` ごとに `latest()` の規則を適用します。たとえば `packet.event.pubkey` を key にすれば公開鍵ごとの最新 EVENT を取得できます。

## sortEvents()

`sortEvents(bufferTime, compareFn?)` は入力を指定した milliseconds だけ遅らせ、その間の buffer から順に packet を取り出します。既定では古い時刻順、同時刻なら ID の大きい順です。比較関数 `(a, b) => number` で順序を変更できます。buffer の時間幅を超えて到着する EVENT まで含めた全体の整列は保証しません。

## timeline()

`timeline(limit?)` は新しい時刻順、同時刻なら ID の小さい順の packet 配列を蓄積し、入力ごとに通知します。`limit` の省略時は件数を制限しません。重複排除は行わないため、必要なら前段に `uniq()` を組み合わせます。

`timeline(0)` は各入力で空配列を通知し、`timeline(1)` は最新の1件だけを通知します。`limit` は 0 以上の整数に限られ、不正な値は `RangeError` になります。

状態を持つ operator の共有については [Operator instance の所有権](./operators#operator-instance-の所有権) を参照してください。
