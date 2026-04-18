# Connection Strategy

**Connection Strategy** determines when rx-nostr establishes and breaks WebSocket communication. Connection Strategy is only valid on the default relays, and connections to the temporary relay are dropped as soon as they are no longer needed, regardless of the Connection Strategy setting.

The default Connection Strategy is **Lazy Strategy**. You can change this by `connectionStrategy` option of `createRxNostr()`.

## Lazy Strategy

**Lazy Strategy** treats all default relays as if they were temporary relays. That is, it connects to a relay only when it needs to communicate with that relay, and disconnects immediately when it no longer needs to.

## Lazy-Keep Strategy

**Lazy-Keep Strategy** is almost like the Lazy Strategy, but does not disconnect as long as it is designated as the default relay. It will only disconnect when it is no longer needed after the relay is removed from the default relays.

## Aggressive Strategy

Under **Aggressive Strategy**, rx-nostr connects immediately when a relay gets a default relay and does not disconnect as long as it is a default relay. Like the Lazy-Keep Strategy, it disconnects only when it is no longer needed after the relay is removed from the default relays.
