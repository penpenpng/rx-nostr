# Publish EVENT

You can use `RxNostr`'s `send()` method to send EVENT messages.

The argument of `send()` is an event object of which only `kind` and `content` are required and the rest are optional.
The object given as the argument is signed by a `signer` specified in the options of `createRxNostr()` and sent to the appropriate relays. For more information on `signer`, see [Signer](./signer).

```ts:line-numbers
import { createRxNostr, seckeySigner } from "rx-nostr";

const rxNostr = createRxNostr({
  signer: seckeySigner("nsec1..."),
});
rxNostr.setDefaultRelays(["wss://nostr.example.com"]);

rxNostr.send({
  kind: 1,
  content: "Hello, Nostr!",
});
```

::: tip Note
The `signer` can also be passed as the second argument of `send()`. If `signer` is specified in both, the one passed as the argument to `send()` is used.
:::

## Handling OK Messages

The return value of `send()` is a `subscribe()`-able object, but it is not necessary to `subscribe()` it. If you need to subscribe OK messages, `subscribe()` helps you.

```ts
rxNostr.send(event).subscribe((packet) => {
  console.log(
    `Sending to ${packet.from} ${packet.ok ? "succeeded" : "failed"}.`,
  );
});
```

If you are not interested in the result of the OK message, there is no need to `subscribe()`. If you `unsubscribe()` the result of `subscribe()`, it will stop resending the message to relays that have not yet been successfully sent.

::: warning
If an AUTH based on [NIP-42](https://github.com/nostr-protocol/nips/blob/master/42.md) is requested during the EVENT transmission process, rx-nostr will automatically resend the EVENT message after the AUTH. Note that in this scenario you may receive two OK messages from the same relay. When an OK message is received from one relay, check that `packet.done` is `false` to see if a second OK message may be.
:::

::: tip RxJS Tips
The return value of `send()` is strictly an Observable. This Observable completes when it is determined that no more OK messages can be received. It also completes when 30 seconds elapses without any OK message being received, even though one is still possible. This behavior can be changed with the `okTimeout` option of `createRxNostr()` and `completeOn` option of `send()`.
:::

## cast()

`cast()` is almost the same as `send()`, but returns a `Promise<void>` that is resolved as soon as the event has been delivered to at least one of the relays.

::: warning
It is guaranteed at least one submission attempt to all relays that are connected at the time `cast()` is called, but it is not guaranteed submission attempt to other relays after the resolution of the Promise.

Use `cast()` only in specific situations where a successful send to any one relay is sufficient.
:::
