# Signer

Signer can be specified as an option to `createRxNostr()` or `rxNostr.send()`.
Signer is used to calculate the remaining parameters required by the protocol from the intrinsic content (`kind`, `content`, `tags`) of events.
One of `nip07Signer()`, `seckeySigner()`, `noopSigner()`, or Custom Signer can be used.

Default Signer is `nip07Signer()`.

## nip07Signer()

`nip07Signer()` looks for the [NIP-07](https://github.com/nostr-protocol/nips/blob/master/07.md) interface from runtime and uses it.

You can use `tags` option to append the fixed tags on signing each event.

```ts
import { nip07Signer } from "rx-nostr";
```

## seckeySigner()

`seckeySigner()` calcutes with the given secret key.
The both of nsec format and hex format is acceptable.
This is provided by rx-nostr-crypto package.

You can use `tags` option to append the fixed tags on signing each event.

```ts
import { seckeySigner } from "rx-nostr-crypto";

const signer = seckeySigner("nsec1...");
```

## noopSigner()

`noopSigner()` does nothing.
The given events are sent as is.

```ts
import { noopSigner } from "rx-nostr";
```

## Custom Signer

An arbitrary custom Signer can be created by implementing the following `EventSigner` interface.

```ts
import * as Nostr from "nostr-typedef";

interface EventSigner {
  signEvent<K extends number>(
    params: Nostr.EventParameters<K>,
  ): Promise<Nostr.Event<K>>;
  getPublicKey(): Promise<string>;
}
```

When implementing Signer, it is recommended that the below conventions be followed:

- It has no side effects other than creating an event from the given parameters.
- If a computable and optional parameter (`id`, `sig`, `pubkey`, `created_at`) is given, create an event respecting the given parameter, even if they are illegal parameters. Or, if they are invalid parameters, throw an exception.

Following them helps that developers precompute an event if they are interested in the `id` or `pubkey` of the event that will actually be sent:

```ts
import { createRxNostr } from "rx-nostr";
import { seckeySigner } from "rx-nostr-crypto";

const signer = seckeySigner("nsec1...");

const rxNostr = createRxNostr({ signer });
rxNostr.setDefaultRelays(["wss://nostr.example.com"]);

const eventParams = {
  kind: 1,
  content: "Hello, Nostr!",
};
const event = await signer.signEvent(eventParams);

console.log(`${event.id} will be sent.`);

rxNostr.send(event);
```
