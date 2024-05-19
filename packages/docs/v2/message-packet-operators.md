---
sidebarDepth: 0
---

# MessagePacket Operators

`rxNostr.createAllMessageObservable()` が返す `Observable<MessagePacket>` に対して適用可能な Operator のリファレンスです。

[[TOC]]

## filterByType()

与えられたタイプ (すなわち `"EVENT"`, `"EOSE"`, `"OK"` など) に合致するメッセージのみ抽出し、ほかを排除します。TypeScript において、このフィルターは型ガードのように機能します。

```ts
import { filterByType } from "rx-nostr";

// ...

rxNostr
  .createAllMessageObservable()
  .pipe(filterByType("AUTH"))
  .subscribe(() => {
    // ...
  });
```
