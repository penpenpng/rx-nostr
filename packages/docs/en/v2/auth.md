# AUTH

You can set the `authenticator` option of `createRxNostr()` to automatically handle AUTH messages based on [NIP-42](https://github.com/nostr-protocol/nips/blob/master/42.md). If this feature is enabled, REQs or EVENTs rejected with an `auth-required` status will be automatically retransmitted after a successful AUTH.

The simplest setting is `authenticator: “auto”`. This will respond to AUTH messages using the `signer` given to `RxNostr`. This setting should be sufficient for most use cases.

```ts:line-numbers
import { createRxNostr } from "rx-nostr";

const rxNostr = createRxNostr({ authenticator: "auto" });
```

For more advanced use cases, the `authenticator` can optionally take a `signer`. This allows the AUTH message to be created using a different signer than when issuing normal events:

```ts:line-numbers
import { createRxNostr, nsecSigner } from "rx-nostr";

const rxNostr = createRxNostr({
  signer: nsecSigner("nsec1aaa..."),
  authenticator: {
    signer: nsecSigner("nsec1bbb..."),
  },
});
```

It is also possible to specify a function format in case you want to use a different signer for each relay. For example, the following example responds to AUTH messages only on `wss://nostr.example.com` and ignores AUTH on other relays:

```ts:line-numbers
import { createRxNostr, nsecSigner } from "rx-nostr";

const rxNostr = createRxNostr({
  authenticator: (relayUrl) => {
    if (relayUrl === "wss://nostr.example.com") {
      return "auto";
    } else {
      return undefined;
    }
  },
});
```
