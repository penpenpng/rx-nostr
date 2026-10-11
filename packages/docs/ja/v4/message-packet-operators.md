# MessagePacket Operators

`type` field を持つ packet の Observable に適用できる operator です。v4 の `RxNostr` は raw message stream や `createAllMessageObservable()` を公開しません。アプリケーションが持つ packet stream や、複数の公開 stream を合わせた Observable に適用できます。

[[TOC]]

## filterByType()

`filterByType(type)` は `type` discriminant で packet を絞り込み、型も narrow します。値が指定文字列と一致する packet だけを通します。

<!-- typecheck-example: operators-message -->
```ts
import { filterByType } from "rx-nostr/operators";
import type { EventPacket, OkPacket } from "rx-nostr";
import type { Observable } from "rxjs";

declare const packets$: Observable<EventPacket | OkPacket>;
packets$.pipe(filterByType("OK")).subscribe((packet) => console.log(packet.ok));
```
