# Relay Configuration

The set of relays that `RxNostr` actually communicates with can be specified in several ways. The most basic way is to set **default relays**.

## Default Relays

Default relays is a set of relays including settings of permissions of read/write, which can be set using `rxNostr.setDefaultRelays()`. If no permissions are given, both are treated as allowed.

When `rxNostr.send()` and `rxNostr.use()` are executed without specifying a temporary relay as described below, the default relay registered here is used.

```ts
import { createRxNostr } from "rx-nostr";

const rxNostr = createRxNostr();
rxNostr.setDefaultRelays([
  "wss://nostr1.example.com",
  "wss://nostr2.example.com",
  "wss://nostr3.example.com",
]);
```

If you want to specify permission:

```ts
rxNostr.setDefaultRelays([
  // Readonly
  {
    url: "wss://nostr1.example.com",
    read: true,
  },
  // Writeonly
  {
    url: "wss://nostr1.example.com",
    write: true,
  },
]);
```

If the NIP-07 interface is available, its return value can also be passed directly:

```ts
rxNostr.setDefaultRelays(await window.nostr.getRelays());
```

### Reactivity

Communication on the default relay is reactive and adaptive with respect to reading. That is, changes in default relays are immediately reflected in the currently established REQ subscriptions.

To elaborate, assuming a REQ subscription on default relays already exists, a changing in default relay configuration immediately CLOSEs REQs on relays no longer allowed to read, and issues new REQs on relays newly allowed to read.

Changing default relays does not affect communication over the temporary relay, which is discussed below.

## Temporary Relays

You can communicate over **temporary relays** by passing the `on` option as the second argument to `rxNostr.send()` or `rxNostr.use()`. Temporary relays are connected only as long as they are needed and disconnected when they are no longer needed, regardless of the current Connection Strategy.

Temporary relay does **not** respect the permission settings on default relays. That is, it will write to or read from the temporary relay regardless of default relays configuration.

### Publish on Temporary Relays

You can send events to temporary relays by passing the `on` option as the second argument to `rxNostr.send()`.
For example, the following example sends the event to `wss://example.com` in addition to the default write relays.

```ts
rxNostr.send(
  { kind: 1, content: "Hello" },
  {
    on: {
      relays: ["wss://example.com"],
      defaultWriteRelays: true,
    },
  },
);
```

Temporary relays are only connected during the write communication, in other words, from the time an EVENT is issued until the time an OK is received. After that they are disconnected unless they are being used as another default relay or temporary relay.

### Subscribe on Temporary Relays

There are two types of temporary relays for reading: **use scope** specified with `on` option of `rxNostr.use()` and **emit scope** specified with `relays` option of `rxReq.emit()`. The narrower scope (that is, emit scope) takes precedence.

Temporary relays are only connected during the read communication, in other words, from the time an REQ is issued until the time it is CLOSE'd. After that they are disconnected unless they are being used as another default relay or temporary relay.
