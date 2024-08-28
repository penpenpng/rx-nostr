# NIP-11 Registry

As described at [REQ Queue](./subscribe-event#req-queue), rx-nostr will automatically fetch information related to NIP-11 in order to respect the relay's constraints. You can disable this behavior by `skipFetchNip11` option of `createRxNostr()`.

::: tip Note
For now, the only information that rx-nostr uses to optimize its behavior is `limitation.max_subscriptions`.
:::

The NIP-11 information handled by rx-nostr is aggregated in `Nip11Registry`. The `Nip11Registry` is public, and developers can access NIP-11 information through static methods provided by this class.

## Get NIP-11 info

`Nip11Registry.get()` allows you to get cache of NIP-11 information.

## Fetch NIP-11 info manually

You can maually fetch NIP-11 information by `Nip11Registry.fetch()`. Once NIP-11 fetched like this, rx-nostr can use the information to optimize its behavior even if `skipFetchNip11` is set.

## Set Default NIP-11 info

If `skipFetchNip11` is set for some reasons (like test) or if the relay doesn't support NIP-11, you can use `Nip11Registry.setDefault()` to set default NIP-11 information.

For example, with the following code, rx-nostr will act as if `limitation.max_subscriptions` were `10` when it cannot obtain NIP-11 information.

```ts
import { Nip11Registry } from "rx-nostr";

Nip11Registry.setDefault({
  limitation: {
    max_subscriptions: 10,
  },
});
```

## Set NIP-11 info manually

You can manually set NIP-11 information for specific relay.

```ts
import { Nip11Registry } from "rx-nostr";

Nip11Registry.set("wss://nostr.example.com", {
  limitation: {
    max_subscriptions: 10,
  },
});
```
