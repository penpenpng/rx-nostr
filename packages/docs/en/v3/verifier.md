# Verifier

Verifier can be specified as an option to `createRxNostr()` or `rxNostr.use()`.
Verifier is used to verify the signature (`sig`) of events.
One of `verifier`, `noopVerifier`, Custom Signer, or Worker Verifier can be used.

No default verifier.
`verifier` in `createRxNostr()` is required.
If you do not intentionally perform verification, specify `noopVerifier` explicitly or enable the `skipVerify` option.

## verifier

`verifier` verifies the signature using the implementation provided by the @noble and @scure packages.
This is provided by rx-nostr-crypto package.

```ts
import { verifier } from "rx-nostr-crypto";
```

## noopVerifier

`noopVerifier` does nothing.
It considers all given events to be valid events.

```ts
import { noopVerifier } from "rx-nostr";
```

## Custom Verifier

An arbitrary custom Verifier can be created by implementing the following `EventVerifier` interface.

```ts
import * as Nostr from "nostr-typedef";

interface EventVerifier {
  (params: Nostr.Event): Promise<boolean>;
}
```

When implementing Verifier, you must follow the below conventions:

- Return `Promise<true>` if the given event is valid, and return `Promise<false>` if it is invalid.
- If the validity of the given event cannot be judged, throw an exception.
- Assume that it may be executed more than once for each event.

## Worker Verifier

Signature verification often causes UI threads to hang, so if a large number of events need to be verified, it is more effective to do the verification on a worker thread to improve UI responsiveness.

Using `createVerificationServiceClient()` and `startVerificationServiceHost()`, you can easily create a Verifier running on a worker as follows.

Suppose worker.ts is a script to run on a worker.
First, write worker.ts as follows to create a service that performs the verification process on WebWorker:

```ts
// worker.ts

import { startVerificationServiceHost } from "rx-nostr-crypto";

startVerificationServiceHost();
```

::: tip Note
You can pass an arbitrary verifier to the `verifier` option of `startVerificationServiceHost()` to delegate the essential verification process.
By default, `verifier` is used.
:::

Next, create a client `VerificationServiceClient` on the UI thread that generates a Worker and queries it.
If you are using [vite](https://vitejs.dev) as a bundler, [import by `?worker&url` query](https://vitejs.dev/guide/features.html#web-workers) is useful:

```ts
import { createRxNostr } from "rx-nostr";
import { createVerificationServiceClient } from "rx-nostr-crypto";

import workerUrl from "./worker-host?worker&url";

const client = createVerificationServiceClient({
  worker: new Worker(workerUrl, { type: "module" }),
});
client.start();

const rxNostr = createRxNostr({
  verifier: client.verifier,
});

// After you no longer need to use the client:
client.dispose();
```

When the `VerificationServiceClient` is no longer needed, remember to call `client.dispose()` to terminate the worker.
You may also terminate the Worker with `worker.terminate()` based on the standard Worker API.

::: tip Note
In SSR case, `new Worker()` fails because `Worker` does not exist in the server context.
`createNoopClient()` can be used to create a dummy `VerificationServiceClient` in the server context:

```ts
import {
  createVerificationServiceClient,
  createNoopClient,
} from 'rx-nostr-crypto';
import workerUrl from './worker-host?worker&url';

const isBrowser = /* ... */;

using client = isBrowser ?
  createVerificationServiceClient({
    worker: new Worker(workerUrl, { type: 'module' }),
  })
  : createNoopClient();
```

:::
