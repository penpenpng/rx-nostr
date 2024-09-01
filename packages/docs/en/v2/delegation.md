# Delegation

rx-nostr supports event delegation based on [NIP-26](https://github.com/nostr-protocol/nips/blob/master/26.md).

## Publish Deleteged Events

You can use `delegateSigner()` to issue delegated events.

```ts
import { delegateSigner, seckeySigner } from "rx-nostr";

const signer = delegateSigner({
  delegateeSigner: seckeySigner(seckeyChild),
  delegatorSeckey: seckeyRoot,
  allowedKinds: [0, 1],
  allowedSince: 777777,
  allowedUntil: 888888,
});
```

The `allowed... ` field is used only to create a delegation string. That is, the signer with `delegateSigner()` can also generate events outside the delegation condition.

You can use `validateDelegation()` to validate the delegation condition.

## Subscribe Delegated Events

Enabling the `acceptDelegatedEvent` option allows you to subscribe to delegated events (if the relay supports queries based on NIP-26).

Regardless of the `acceptDelegatedEvent` setting, the `EventPacket` exposes a `rootPubkey` field. This field is equal to the public key of the delegator if the event is delegated, or the public key of the event's author if the event is not delegated.

See also [Auto Validation](./auto-filtering#auto-validation).
