# Publish EVENT

You can use `RxNostr`'s `send()` method to send EVENT messages.

The first argument is an event object where only `kind` and `content` is required and rest is optional.Specified parameters are respected even if they are invalid. On the other hand, unspecified parameters, especially `pubkey`, `id`, and `sig`, are computed by the `signer`.

`signer` can be passed as an option to `createRxNostr()` or as the second argument to `send()`. If `signer` is specified as both, the one passed as the second argument to `send()` is used. For normal use, it is better to pass it as an option of `createRxNostr()`.

```ts:line-numbers
import { createRxNostr, seckeySigner } from "rx-nostr";

const rxNostr = createRxNostr({
  // The both of nsec1... format and HEX format are acceptable.
  signer: seckeySigner("nsec1..."),
});
rxNostr.setDefaultRelays(["wss://nostr.example.com"]);

rxNostr.send({
  kind: 1,
  content: "Hello, Nostr!",
});
```

::: tip Note
The default `signer` is `nip07Signer()`. It looks for the [NIP-07](https://github.com/nostr-protocol/nips/blob/master/07.md) interface from the runtime and uses it.
:::

You may be interested in the `id` or `pubkey` of the event object that is actually sent. You can use `signer` to calculate them yourself.

```ts:line-numbers
import { createRxNostr, seckeySigner } from "rx-nostr";

const signer = seckeySigner("nsec1...");

const rxNostr = createRxNostr({
  signer,
});
rxNostr.setDefaultRelays(["wss://nostr.example.com"]);

const eventParams = {
  kind: 1,
  content: "Hello, Nostr!",
};
const event = await signer.signEvent(eventParams);

rxNostr.send(event);

const id = event.id;
// This will be the same as `event.pubkey`.
const pubkey = await signer.getPublicKey();

console.log(`${pubkey} sent ${id}.`);
```

## Handling OK Messages

The return value of `send()` is a `subscribe()`-able object, but it is not necessary to `subscribe()` it. If you need to subscribe OK messages, `subscribe()` helps you.

```ts
rxNostr.send(event).subscribe((packet) => {
  console.log(
    `Sending to ${packet.from} ${packet.ok ? "succeeded" : "failed"}.`,
  );
});
```

::: warning
If an AUTH based on [NIP-42](https://github.com/nostr-protocol/nips/blob/master/42.md) is requested during the EVENT transmission process, rx-nostr will automatically resend the EVENT message after the AUTH. Note that in this scenario you may receive two OK messages from the same relay. When an OK message is received from one relay, check that `packet.done` is `false` to see if a second OK message may be.
:::

::: tip RxJS Tips
The return value of `send()` is strictly an Observable. This Observable completes when it is determined that no more OK messages can be received. It also exits with an error when 30 seconds elapses without any OK message being received, even though one is still possible. This timeout can be changed with the `okTimeout` option of `createRxNostr()`.
:::
