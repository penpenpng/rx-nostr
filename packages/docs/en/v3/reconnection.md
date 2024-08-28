# Reconnection

When a WebSocket is disconnected for unexpected reasons, rx-nostr will automatically try to reconnect. This behavior can be changed with the `retry` option of `createRxNostr()`. By default, rx-nostr tries to reconnect up to 5 times according to the [exponential backoff and jitter](https://aws.amazon.com/jp/blogs/architecture/exponential-backoff-and-jitter/) strategy.

After WebSocket is reconnected, any ongoing communication in the old connection is automatically restored. That is;

- REQ is re-issued. This may result in the re-receipt of EVENT messages that were received in the past.
- If there are any sent EVENT messages that have not yet been confirmed as OK, they will be sent again.

::: tip Note
If a WebSocket connection is disconnected with status code 4000, it will not be automatically reconnected. This is for backward compatibility with the [deprecated old NIP-01 specification](https://github.com/nostr-protocol/nips/commit/0ba4589550858bb86ed533f90054bfc642aa5350).
:::

## Lazy since/until

Reissuing the same REQs upon WebSocket reconnection may not be desirable.

For example, suppose you send a `{ since: Math.floor(Date.now() / 1000) }` filter to subscribe to posts _in the future_ of the present. If a WebSocket reconnection occurs while this subscription is active, the exact same REQ will be sent to the relay again, which means that you will request events that are "in the past" from the point of reconnection. This behavior is not desired.

For this problem, `rxReq.emit()` allows `LazyFilter` type instead of the standard Nostr Filter object. A `LazyFilter` is a Filter that also accepts a function of type `() => number` instead of a number for `since` or `until`. If you pass a function for `since`/`until`, the value of `since`/`until` that is actually sent to the relay is evaluated just before it is sent.

In the above example, you can resolve the problem by using `{ since: () => Math.floor(Date.now() / 1000) }` instead of `{ since: Math.floor(Date.now() / 1000) }` because `since` is reevaluated at the point of reconnection. rx-nostr exposes `now` utility for use cases like this.

```ts
import { createRxNostr, createRxForwardReq, now } from "rx-nostr";

const rxNostr = createRxNostr();
rxNostr.setDefaultRelays(["wss://nostr.example.com"]);

const rxReq = createRxForwardReq();

rxNostr.use(rxReq).subscribe(console.log);

rxReq.emit({ kinds: [1], since: now });
```
