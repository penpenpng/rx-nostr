<h1 align="center">rx-nostr</h1>

<p align="center">
  rx-nostr is a library that supports high quality and flexible communication with multiple Nostr relays.
</p>

<p align="center">
  <a href="https://penpenpng.github.io/rx-nostr/">documentation</a> /  <a href="https://github.com/penpenpng/rx-nostr/releases">release notes</a>
</p>

## Description

rx-nostr provides transparent interface to read/write events on Nostr relays.
You can exchange data in a very familiar way (as you see [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md)) with that interface, but it allows for far more robust and flexible communication than you can do by touching WebSocket directly. For example:

- Auto sign/verify
  - Sign/verify events automatically by integrating with @rx-nostr/crypto or other arbitrary crypto libraries.
- Auto adaptive reconnection
  - If the subscription is based on a time relative to its start time, consider it when auto reconnecting.
- Auto expiration check
  - Based on NIP-40, ignore expired events.
- REQ queue respecting NIP-11
  - Based on NIP-11, queuing requests if they exceed the limit of subscriptions that can run concurrently.
- Reactive relay pool
  - On updating "default relays", the subscriptions on default relays is reconstructed on new default relays.
- Monitoring WebSocket connection
  - For example, it helps you show relay status to users.
- Lazy connection
  - As default, connection is deferred until it is really needed.
- Idling connection
  - As default, connections that are no longer needed are automatically disconnected temporarily.

Under the hood, rx-nostr makes use of [RxJS](https://rxjs.dev/), but you don't need to touch it directly. Of course, if you are familiar with RxJS, you can integrate with it for easier and more declarative writing.

## Quickstart

```
npm install rx-nostr @rx-nostr/crypto
```

```ts
import { RxNostr } from "rx-nostr";
import { SimpleVerifier } from "@rx-nostr/crypto";

const rxNostr = new RxNostr({
  verifier: new SimpleVerifier(),
});

const subscription = rxNostr
  .forward(["wss://nostr.example.com"], [{ kinds: [1] }])
  .subscribe(({ event }) => {
    console.log(event);
  });

// When finished:
subscription.unsubscribe();
rxNostr.dispose();
```

## For more information

- Documentation: https://penpenpng.github.io/rx-nostr/
- Release notes: https://github.com/penpenpng/rx-nostr/releases

## Development

This repository uses the pnpm version declared in `package.json` and the
workspace defined in `pnpm-workspace.yaml`.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

The workspace rejects dependency releases newer than one day by default. Add
an exception only for an urgent security fix. User-visible changes must include
a Changesets entry created with `pnpm changeset`.

## License

[MIT](https://opensource.org/licenses/MIT)
