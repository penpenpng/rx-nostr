# MessagePacket Operators

References of operators that can be applied to `Observable<MessagePacket>`, which is returned by `rxNostr.createAllMessageObservable()`.

[[TOC]]

## filterByType()

Only messages that match the given type (i.e., `“EVENT”`, `“EOSE”`, `“OK”`, etc.) are passed through, and others are eliminated. In TypeScript, it works as a type guard.

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
