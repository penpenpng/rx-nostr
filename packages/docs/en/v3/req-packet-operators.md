# ReqPacket Operators

References of operators that can be applied to `rxReq`.

[[TOC]]

## batch()

Converts an Observable of `ReqPacket[]` to an Observable of `ReqPacket` based on the `mergeFilter` parameter. This is useful in conjunction with [`bufferTime()`](https://rxjs.dev/api/operators/bufferTime).

If the `mergeFilter` parameter is omitted, the filters are simply combined.

```ts
import { bufferTime } from "rxjs";
import { batch, latestEach, now } from "rx-nostr";

// ...

// Forward REQ observing kind1 timeline.
const timelineReq = createRxForwardReq();

// Backward REQ fetching kind0 on demand.
const profileReq = createRxBackwardReq();

rxNostr.use(timelineReq).subscribe((packet) => {
  const event = packet.event;

  // Get kind0 of user appeared in the timeline.
  profileReq.emit({
    kinds: [0],
    authors: [event.pubkey],
    limit: 1,
  });
});

// To prevent a large number of REQs from being issued in a short period of time,
// REQs are issued in batches every second
const batchedReq = profileReq.pipe(bufferTime(1000), batch());

rxNostr
  .use(batchedReq)
  .pipe(latestEach((packet) => packet.event.pubkey))
  .subscribe((packet) => {
    console.log("kind0", packet);
  });

timelineReq.emit({ kinds: [1], since: now });
```

## chunk()

Split `ReqPacket` into several `ReqPackets` as needed.

Currently rx-nostr cannot automatically respect the `max_filters` defined in NIP-11, so `chunk()` must be used if an REQ with a large number of filters can be issued.

The first argument is a `predicate` that determines if a split is necessary, and the second argument is `toChunks` that specifies the method of split.

```ts
import { chunk } from "rx-nostr";

const chunkedReq = rxReq.pipe(
  chunk(
    (filters) => filters.length > 100,
    (filters) => {
      const pile = [...filters];
      const chunks = [];

      while (pile.length > 0) {
        chunks.push(pile.splice(0, 100));
      }

      return chunks;
    },
  ),
);

rxNostr.use(chunkedReq).subscribe(() => {
  // ...
});
```
