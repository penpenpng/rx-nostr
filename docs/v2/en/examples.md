# Examples

[[TOC]]

## Subscribe all kind1 and filter them at local

```ts:line-numbers{11-12}
import { createRxNostr, createRxForwardReq, filterBy, now } from "rx-nostr";

const MY_FOLLOWEES = ["hex1", "hex2", "hex3"];

const rxNostr = createRxNostr();
await rxNostr.switchRelays(["wss://nostr.example.com"]);

const rxReq = createRxForwardReq();
rxNostr
  .use(rxReq)
  // Filter by a filter object. Note that `limit` is ignored.
  .pipe(filterBy({ authors: MY_FOLLOWEES }))
  .subscribe(console.log);

rxReq.emit({ kinds: [1], since: now() });
```

## Subscribe to the latest 100 notes of the timeline

```ts:line-numbers{15-16}
import {
  createRxForwardReq,
  createRxNostr,
  now,
  timeline,
  uniq,
} from "rx-nostr";

const rxNostr = createRxNostr();
await rxNostr.switchRelays(["wss://nostr.example.com"]);

const rxReq = createRxForwardReq();
rxNostr.use(rxReq).pipe(
  uniq(),
  // Map to a list where created_at is in descending order.
  timeline(100)
).subscribe(console.log);

rxReq.emit({ kinds: [1], since: now() });
```

## Get the latest profile of the author of each post in the timeline

```ts:line-numbers{20-27,32-42}
import { tap, bufferTime } from "rxjs";
import {
  createRxBackwardReq,
  createRxForwardReq,
  createRxNostr,
  batch,
  latestEach,
  now,
} from "rx-nostr";

const rxNostr = createRxNostr();
await rxNostr.switchRelays(["wss://nostr.example.com"]);

const timelineReq = createRxForwardReq();
const profileReq = createRxBackwardReq();

rxNostr
  .use(timelineReq)
  .pipe(
    // Emit each time a packet is received
    tap(({ event }) => {
      profileReq.emit({
        kinds: [0],
        authors: [event.pubkey],
        limit: 1,
      });
    })
  )
  .subscribe((packet) => console.log("kind1", packet));

rxNostr
  // To avoid sending a large number of REQs in a short
  // period of time, REQs are sent together every second.
  .use(profileReq.pipe(
    bufferTime(1000),
    batch(),
  ))
  .pipe(
    // For each pubkey, only the latest kind0 is retrieved
    // and the rest is ignored.
    latestEach((packet) => packet.event.pubkey),
  )
  .subscribe((packet) => console.log("kind0", packet));

timelineReq.emit({ kinds: [1], since: now() });
```

## Await a note with specific note ID

```ts:line-numbers{14-16}
import { firstValueFrom } from "rxjs";
import { createRxNostr, createRxOneshotReq } from "rx-nostr";

const NOTE_ID = "hex";

const rxNostr = createRxNostr();
await rxNostr.switchRelays([
  "wss://nostr1.example.com",
  "wss://nostr2.example.com"
]);

const rxReq = createRxOneshotReq({ filters: [{ ids: [NOTE_ID] }] });

// After the first message is received from either relay,
// the Rx subscription is unsubscribed, then all REQs will be CLOSE'd.
const packet = await firstValueFrom(rxNostr.use(rxReq));

console.log(packet);
```

## Get relay lists for which a specified note exists

```ts:line-numbers{16-20}
import { scan } from "rxjs";
import { createRxNostr, createRxOneshotReq, type EventPacket } from "rx-nostr";

const NOTE_IDS = ["hex1", "hex2", "hex3"];

const rxNostr = createRxNostr();
await rxNostr.switchRelays([
  "wss://nostr1.example.com",
  "wss://nostr2.example.com",
]);

const rxReq = createRxOneshotReq({ filters: [{ ids: NOTE_IDS }] });
rxNostr
  .use(rxReq)
  .pipe(
    scan<EventPacket, Record<string, Set<string>>>((acc, packet) => {
      acc[packet.event.id] ??= new Set();
      acc[packet.event.id]?.add(packet.from);
      return acc;
    }, {})
  )
  .subscribe(console.log);

/* Sample Output:
{
  "hex1": Set (1) {"wss://nostr1.example.com"},
  "hex2": Set (2) {"wss://nostr1.example.com", "wss://nostr2.example.com"},
  "hex3": Set (0) {},
}
*/
```
