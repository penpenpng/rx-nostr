# Overview

rx-nostr is a library that allows [Nostr](https://nostr.com/) applications to easily and intuitively provide robust communication with one or more relays. As the name shows, rx-nostr is implemented in [RxJS](https://rxjs.dev/) and is designed to work seamlessly with RxJS features, but you don’t need to know much about RxJS.

By using rx-nostr, developers can transparently handle publish/subscribe based on [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) without being aware of the following troublesome problems associated with relay communication.

- **REQ Subscription Management**:
  - Low-level operations essential to REQ subscription management, such as establishing REQs, sending CLOSEs, and handling CLOSED messages, can be handled in a higher-level, abstracted interface.
- **WebSocket reconnection**:
  - The WebSocket transmission channel can be automatically reconnected based on a backoff strategy. REQ subscriptions lost from the transmission channel by disconnection are also automatically reconstituted.
- **Delaying and idling WebSocket Connections**:
  - You can delay WebSocket connections to relays until they are really needed or automatically disconnect connections that are no longer in use. This behavior can also be disabled in the configuration.
- **Monitoring WebSocket connection status**:
  - The health status of WebSocket connections can be monitored. Applications can use this, for example, to build an interface that notifies users of the status of the connection to relays.
- **Relay Pool Management**:
  - A set of relays is handled reactively. That is, changing in relay configurations, such as increasing or decreasing the number of default relays or changing read/write settings, properly reconfigures the currently active REQs under the new relay configuration.
- **Flexible support for relay server-specific constraints**:
  - REQ requests to relays is queued properly so as not to violate the relay's concurrent REQ subscription limits published under [NIP-11](https://github.com/nostr-protocol/nips/blob/master/11.md).
- **Automatic Handling of AUTH Messages**:
  - AUTH messages can be automatically handled based on [NIP-42](https://github.com/nostr-protocol/nips/blob/master/42.md) if you just set an option.
- **Sign and verify**:
  - Signing and verification are automatic. The only information a developer needs to provide when publishing an event is the event's essential content.

Using rx-nostr, the code to subscribe to kind-1 events, for example, can be implemented simply as follows. This code is explained in detail in [Getting Started](./getting-started) .

```js
import { createRxNostr, createRxForwardReq } from "rx-nostr";

const rxNostr = createRxNostr();
rxNostr.setDefaultRelays(["wss://nostr.example.com"]);

const rxReq = createRxForwardReq();

rxNostr.use(rxReq).subscribe((packet) => {
  console.log(packet);
});

rxReq.emit({ kinds: [1] });
```

::: tip Note
This document assumes a basic understanding of the NIP, and in particular the NIP-01. If you are not familiar with this, we recommend that you read through the following documents first:

- [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md)

:::
