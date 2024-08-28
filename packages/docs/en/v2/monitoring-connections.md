# Monitoring Connections

`rxNostr.createConnectionStateObservable()` allows you to observe the status of WebSocket connection that is held by `RxNostr`.

```ts
import { createRxNostr } from "rx-nostr";

const rxNostr = createRxNostr();

rxNostr.createConnectionStateObservable().subscribe((packet) => {
  console.log(`Connection status changed: ${packet.from} -> ${packet.state}.`);
});
```

::: tip RxJS Tips
The return value of the method is `Observable<ConnectionStatePacket>` that emits when `ConnectionState` is changed.
:::

Possible `ConnectionState` is:

| `ConnectionState`      | description                                                                   |
| :--------------------- | :---------------------------------------------------------------------------- |
| `initialized`          | The connection is ready to go, but no connection has been attempted yet.      |
| `connecting`           | Connecting for reasons other than automatic reconnection.                     |
| `connected`            | The only state in which communication is possible.                            |
| `waiting-for-retrying` | Reconnection is scheduled but waiting based on backoff strategy.              |
| `retrying`             | Connecting for automatic reconnection.                                        |
| `dormant`              | Communication is not needed at the moment, so it is temporarily disconnected. |
| `error`                | The connection failed after the specified number of reconnection attempts.    |
| `rejected`             | WebSocket terminated with code 4000, so no reconnection was attempted.        |
| `terminated`           | All resources were destroyed because `rxNostr.dispose()` was called.          |

If a WebSocket connection ends in `error` or `rejected`, you can try to reconnect using `rxNostr.reconnect()`. Here is an example of trying to reconnect one minute after terminating with `error`:

```ts
import { delay, filter } from "rxjs";
import { createRxNostr } from "rx-nostr";

const rxNostr = createRxNostr();

rxNostr
  .createConnectionStateObservable()
  .pipe(
    // When an error packet is received, ...
    filter((packet) => packet.state === "error"),
    // Wait one minute.
    delay(60 * 1000),
  )
  .subscribe((packet) => {
    rxNostr.reconnect(packet.from);
  });
```
