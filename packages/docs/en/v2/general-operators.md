# General Operators

References of operators for general purpose.

[[TOC]]

## completeOnTimeout()

Observable is completed when there is no observation for a certain period of time.

::: tip Note
[`timeout()`](https://rxjs.dev/api/operators/timeout) finishes the observable as error, not as complete.
:::

## sort()

A more generic variation of [`sortEvents()`](./event-packet-operators.html#sortevents).

## filterBySubId()

Only packets with `subId` matching the given value are passed through, all others will be eliminated. Available for `EventPacket`, `EosePacket`, `ClosedPacket`, and `CountPacket` Observables.
