# EventPacket Operators

References of operators that can be applied to `Observable<EventPacket>`, which is returned by `rxNostr.use()`.

[[TOC]]

## uniq()

`uniq()` eliminates duplicate events based on `event.id`. Even if `EventPackets` come from different relays, they will be considered the same event if the `event.id` is equal.

The optional `ObservableInput<unknown>` allows you to flush the internal event ID Set.

```ts
import { Subject } from "rxjs";
import { uniq } from "rx-nostr";

// ...

const flushes$ = new Subject<void>();

rxNostr
  .use(rxReq)
  .pipe(uniq(flushes$))
  .subscribe(() => {
    // ...
  });

// Flush the event ID set:
flushes$.next();
```

## createUniq()

`createUniq()` returns an operator that eliminates duplicate events based on the given `keyFn` and a set of event IDs associated with them.

An optional second argument allows you to register a callback function that will be called each time a new Packet is observed.

Unlike `uniq()`, simply call `clear()` to flush.

```ts
import { createUniq, type EventPacket } from "rx-nostr";

// eliminates duplicate events based on event ID:
const keyFn = (packet: EventPacket): string => packet.event.id;

const onCache = (packet: EventPacket): void => {
  console.log(`${packet.id} is observed for the first time.`);
};
const onHit = (packet: EventPacket): void => {
  console.log(`${packet.id} is already observed.`);
};

const [uniq, eventIds] = createUniq(keyFn, { onCache, onHit });

// ...

rxNostr
  .use(rxReq)
  .pipe(uniq())
  .subscribe(() => {
    // ...
  });

// Flush the event ID set:
eventIds.clear();
```

## tie()

It will group identical events from different relays and record in `seenOn` for each event which relay it has been observed on. It also sets the `isNew` flag if the event is the first time it has been observed.

Like `uniq()`, the inner map can be flushed by the optional `ObservableInput<unknown>`.

```ts
import { tie } from "rx-nostr";

// ...

rxNostr
  .use(rxReq)
  .pipe(tie())
  .subscribe((packet) => {
    if (packet.isNew) {
      // New event has been observed.
    }

    console.log(
      `${packet.event.id} was observed on ${packet.seenOn.length} relays.`,
    );
  });
```

:::warning
`tie()` cannot be put after `uniq()`. It should be put before `uniq()`.

```ts
rxNostr
  .use(rxReq)
  .pipe(tie(), uniq())
  .subscribe(() => {
    // ...
  });
```

If you want to use the both of `tie()` and `uniq()` with observing update of `seenOn`, multicast with `share()`:

```ts
import { tie, uniq } from "rx-nostr";
import { share } from "rxjs";

const onSeenOnUpdated = rxNostr.pipe(tie(), share());
const onNewEvent = onSeenOnUpdated.pipe(uniq());

onSeenOnUpdated.subscribe(() => {
  // ...
});
onNewEvent.subscribe(() => {
  // ...
});
```

:::

## createTie()

Returns an Operator similar to `tie()` and a Map associated with it, of type `Map<string, Set<string>>` where the keys are event IDs and the value is a set of relays.

Unlike `uniq()`, simply call `clear()` to flush.

```ts
import { createTie } from "rx-nostr";

// ...

const [tie, seenOn] = createTie();

rxNostr
  .use(rxReq)
  .pipe(tie)
  .subscribe(() => {
    // ...
  });

// Get a list of relays on which the event is observed:
seenOn.get(id);

// Flush seenOn:
seenOn.clear();
```

## latest()

Only events with the most recent `created_at` date observed in the past are passed through, all others are eliminated. In other words, it ensures the chronological order of events flowing through the Observable.

```ts
// Example of subscribing the most up-to-date profile of a particular user.

import { latest } from "rx-nostr";

// ...

rxNostr
  .use(rxReq)
  .pipe(latest())
  .subscribe(() => {
    // ...
  });

rxReq.emit({ kinds: [0], authors: [SOME_USER] });
```

## latestEach()

Based on the given `keyFn`, only events with the most recent `created_at` per key are passed through, all others are eliminated.

This is useful, for example, when you want to collect the latest kind0 for each user.

```ts
// Example of subscribing the most up-to-date profile of each user.

import { latestEach } from "rx-nostr";

// ...

rxNostr
  .use(rxReq)
  .pipe(latestEach(({ event }) => event.pubkey))
  .subscribe(() => {
    // ...
  });

rxReq.emit({ kinds: [0] });
```

## verify()

Verifies event signatures with the given Verifier and eliminates events that fail verification.

Normally, the verification process is done automatically by rx-nostr, but this Operator is useful when `skipVerify` is enabled.

```ts
import { verify } from "rx-nostr";
import { verifier } from "rx-nostr-crypto";

// ...

rxNostr
  .use(rxReq)
  .pipe(verify(verifier))
  .subscribe(() => {
    // ...
  });
```

## filterByKind()

Only events of a given kind are passed through, all others are eliminated.

You can invert the filter condition by specifying `not` as the optional second argument.

With conjunction with `share()`, You can send a rough filter to relays and distribute events finely on the client side.
It helps you reduce the number of concurrent REQ subscriptions.

```ts
import { share } from "rxjs";
import { filterByKind } from "rx-nostr";

// ...

const event$ = rxNostr.use(rxReq).pipe(share());
const kind0$ = events$.pipe(filterByKind(0));
const kind1$ = events$.pipe(filterByKind(1));

kind0$.subscribe(() => {
  // ...
});
kind1$.subscribe(() => {
  // ...
});

rxReq.emit({ kinds: [0, 1] });
```

::: tip RxJS Tips
`unsubscribe()` all multicasted Observables to `unsubscribe()` the original Observable.
:::

## filterBy()

Only events that match the given filter are passed through, all others are eliminated.

You can invert the filter condition by specifying `not` as the optional second argument.

With conjunction with `share()`, You can send a rough filter to relays and distribute events finely on the client side.
It helps you reduce the number of concurrent REQ subscriptions.

```ts
import { share } from "rxjs";
import { filterBy } from "rx-nostr";

// ...

const kind1$ = rxNostr.use(rxReq).pipe(share());

kind1$.pipe(filterBy({ authors: USER_LIST_1 })).subscribe(() => {
  // ...
});
kind1$.pipe(filterBy({ authors: USER_LIST_2 })).subscribe(() => {
  // ...
});

rxReq.emit({ kinds: [1] });
```

::: warning
Note that the `search` and `limit` fields are ignored.
:::

## timeline()

Convert an `EventPacket` Observable to an `EventPacket[]` Observable. Each converted `EventPacket[]` is the latest `limit` events at that time.

```ts
import { timeline } from "rx-nostr";

// ...

rxNostr
  .use(rxReq)
  .pipe(timeline(5))
  .subscribe((packets) => {
    console.log(`The latest 5 events:`, packets);
  });
```

## sortEvents()

Convert to an Observable that is as ordered as possible based on the given wait time and sort key.

An optional second argument allows you to set the sort key. If it is omitted, then the sorting is done in ascending order based on `created_at`.

```ts
import { sortEvents } from "rx-nostr";

// ...

rxNostr
  .use(rxReq)
  .pipe(sortEvents(3 * 1000))
  .subscribe((packet) => {
    // Instead of a 3-second delay, get the events in sequence as much as possible
  });
```

## dropExpiredEvents()

Based on [NIP-40](https://github.com/nostr-protocol/nips/blob/master/40.md) check events and eliminate expired events.

Normally, this is done automatically by rx-nostr, but this Operator is useful if `skipExpirationCheck` is enabled.
