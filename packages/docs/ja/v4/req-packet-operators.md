# ReqPacket Operators

[[TOC]]

`RxReq` は `pipe()` で ReqPacket operator を適用できます。

<!-- typecheck-example: operators-req-batch -->
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

## batch()

`batch()` は正規化した relay URL 集合ごとに filter を結合します。`RxRelays` は同じ内容でも別 instance なら別 group です。group の `relays`、`traceTag`、`linger` などの option は先頭 packet の値を採用し、既定の filter 結合は入力順の連結です。独自の merge 関数は各 filter 配列を順に畳み込みます。空の配列からは packet を出しません。

固定の relay 配列・Set は group 化時に配列へ snapshot します。generator は宛先に指定できません。動的な `RxRelays` は同じ instance を保持します。

## chunk()

`chunk()` は predicate が false なら元 packet を通し、true なら split が返した filter 配列ごとに packet を出します。`relays`、`traceTag`、`linger` は各 packet へ保持され、空の split 結果は packet を出しません。predicate / split が投げた例外は stream の error になります。

`predicate` は `(filters: LazyFilter[]) => boolean`、`split` は `(filters: LazyFilter[]) => LazyFilter[][]` です。

<!-- typecheck-example: operators-req-chunk -->
```ts
import { RxReq } from "rx-nostr";
import { chunk } from "rx-nostr/operators";

const request = new RxReq();
const chunked = request.pipe(chunk(
  (filters) => filters.length > 100,
  (filters) => {
    const remaining = [...filters];
    const chunks = [];
    while (remaining.length > 0) chunks.push(remaining.splice(0, 100));
    return chunks;
  },
));

rxNostr.backward(relays, chunked).subscribe(console.log);
```

`batch(mergeFilter?)` の引数の型 `MergeFilterFunction` も `rx-nostr/operators` から公開され、`(a: LazyFilter[], b: LazyFilter[]) => LazyFilter[]` です。REQ の結合・分割を使う場合も、`forward()` は後続 packet で直前の REQ を置き換え、`backward()` は各 packet を独立して処理します。[Read Events](./read-events) を参照してください。
