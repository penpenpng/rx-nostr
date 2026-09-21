# Operators

rx-nostr は `EventPacket`、`ReqPacket`、一般的な RxJS stream のための operator を公開しています。

## EventPacket operator

```ts
rxNostr
  .req([{}], { relays })
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
| `latest()` | NIP-01 の順序で最新の EVENT だけを通す |
| `latestEach(key)` | key ごとに最新の EVENT だけを通す |
| `sortEvents(ms)` | 一定時間 buffer して EVENT 順に並べる |
| `timeline(limit?)` | 新しい順の packet 配列を蓄積して通知する |

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

`RxForwardReq` と `RxBackwardReq` は `pipe()` で ReqPacket operator を適用できます。

```ts
import { bufferTime } from "rxjs";
import { RxForwardReq, batch } from "rx-nostr";

const source = new RxForwardReq();
const batched = source.pipe(bufferTime(50), batch());

rxNostr.req(batched, { relays }).subscribe(console.log);
```

| operator | 内容 |
| --- | --- |
| `batch(merge?)` | ReqPacket の配列を relay 集合ごとにまとめる |
| `chunk(predicate, split)` | 大きな filter 集合を複数 ReqPacket に分割する |

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

operator は state を持つ場合があります。同じ operator instance を意図せず複数 stream で共有しないでください。
