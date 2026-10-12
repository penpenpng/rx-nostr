# OkPacket Operators

`OkPacket` を扱う Observable に適用できる operator です。`Publication` は `subscribe()` を持ちますが、`pipe()` や `asObservable()` は持ちません。operator を使う場合は、次のように Observable で包みます。

[[TOC]]

## filterByEventId()

`filterByEventId(eventId, options?)` は指定 EVENT ID の `OkPacket` だけを通します。`options.not: true` の場合はその ID を除外します。

ひとつの `Publication` はひとつの EVENT を扱うため、複数 publication の OK stream をまとめた場合などに利用できます。

<!-- typecheck-example: operators-ok -->
```ts
import { filterByEventId } from "rx-nostr/operators";
import type { OkPacket, Publication } from "rx-nostr";
import { Observable } from "rxjs";

declare const publication: Publication;
const packets$ = new Observable<OkPacket>((subscriber) =>
  publication.subscribe(subscriber),
);
packets$.pipe(filterByEventId("0".repeat(64))).subscribe(console.log);
```

この Observable の unsubscribe は OK の観測を終了します。送信を取り消す場合は `publication.cancel()` を呼びます。
