# rx-nostr

Utility to control Nostr in [RxJS](https://rxjs.dev/).

## Examples

```ts
import {
  Relays,
  Relay,
  verifyEvent,
  distinctEvent,
  latest,
} from "rx-nostr";

import { take } from 'rxjs'

const relays = new Relays(
  [
    new Relay("wss://..."),
    new Relay("wss://..."),
    new Relay("wss://...")
  ],
  {
    // Number of attempts to reconnect if the WebSocket disconnects unexpectedly.
    retry: 10,
  }
);

const observableReq = relays.observeReq(
  {
    subId: "...",
    // You can specify raw filters objects or Observable<Filter[]>
    filters: [
      /* ... */
    ],
  },
  {
    // Send CLOSE on receiving EOSE
    untilEose: true,
    onError: "silence",
  }
);

observableReq
  .pipe(
    // Verify message's schema and signature.
    verifyEvent(),
    // Distinct events by their ID.
    distinctEvent()
  )
  .subscribe({
    next: (ev) => console.log(ev),
    complete: () => console.log("done"),
    error: (err) => console.error(err),
  });

// You can create multiple subscriptions.
observableReq
  .pipe(
    // Blocks events older than those already seen.
    latest(),
    // Of course, RxJS native operators can also be used.
    take(10),
  )
  .subscribe((ev) => console.log(ev));

// Broadcast your event. `created_at`, `id` and `sig` are calculated automatically.
relays.send(
  {
    kind: 1,
    pubkey: '...',
    content: '...',
    tags: [],
  },
  // ...but, if this is not a NIP-07 ready environment, secret key is required
  'seckey'
)
```
