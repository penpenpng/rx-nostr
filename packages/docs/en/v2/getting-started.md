# Getting Started

To understand the structure of rx-nostr, you need to know about the three central characters: `RxReq`, `RxNostr` and your application. In the rx-nostr world, data, called Packet, flows between these three characters unidirectionally like `RxReq -> RxNostr -> Your Application`. Before we look at the actual code, let's first see what `RxReq` and `RxNostr` are.

RxReq is an object that sends the information (**`ReqPacket`**) necessary to assemble an [REQ message](https://github.com/nostr-protocol/nips/blob/master/01.md#from-client-to-relay-sending-events-and-creating-subscriptions) to `RxNostr`. You can issue real REQs indirectly through the interface provided by `RxReq`. Note that `RxReq` only provides the necessary information for the REQ message, and it is the role of `RxNostr`, described next, to communicate with the relay.

`RxNostr` is an object that establishes and manages REQ subscriptions with relays based on the received `ReqPackets`. Through the interface provided by `RxNostr`, you can receive various information from relays, including EVENT messages, as Packets.

Note that `RxNostr` is associated with a relay pool. In other words, under the same `RxNostr` instance, all communication with the same relay will be combined into one WebSocket connection, but on the other hand, between different `RxNostr` instances the connection is never shared.

Having viewed the overall flow, let's quickly build a minimal Nostr application! First, we create a `RxNostr` object and associate it with our relay pool.

```ts:line-numbers
import { createRxNostr } from "rx-nostr";

const rxNostr = createRxNostr();
rxNostr.setDefaultRelays([
  "wss://relay1.example.com",
  "wss://relay2.example.com",
]);
```

Next, create a `RxReq` object and associate it with `RxNostr`. Now we are ready to send `ReqPacket` from `RxReq` to `RxNostr`.

```ts:line-numbers{9-11}
import { createRxNostr, createRxForwardReq } from "rx-nostr";

const rxNostr = createRxNostr();
rxNostr.setDefaultRelays([
  "wss://relay1.example.com",
  "wss://relay2.example.com",
]);

const rxReq = createRxForwardReq();

rxNostr.use(rxReq);
```

The return value of `rxNostr.use()` is a `subscribe()`-able object, where you can receive the **`EventPacket`** resulting from the REQ. That is, the highlighted part below is equivalent to `Your Application` in the `RxReq -> RxNostr -> Your Application` flow.

```ts:line-numbers{12-13}
import { createRxNostr, createRxForwardReq } from "rx-nostr";

const rxNostr = createRxNostr();
rxNostr.setDefaultRelays([
  "wss://relay1.example.com",
  "wss://relay2.example.com",
]);

const rxReq = createRxForwardReq();

rxNostr.use(rxReq).subscribe((packet) => {
  // This is your application!
  console.log(packet);
});
```

::: tip RxJS Tips
The return value of `use()` is strictly RxJS [`Observable`](https://rxjs.dev/guide/observable), but it is not essential to know about it. However, developers familiar with RxJS can take advantage of RxJS assets.
:::

However, this application will still not do any work, because no Packets are flowing. So, you have to send out `ReqPacket`s.

```ts:line-numbers{16-17}
import { createRxNostr, createRxForwardReq } from "rx-nostr";

const rxNostr = createRxNostr();
rxNostr.setDefaultRelays([
  "wss://relay1.example.com",
  "wss://relay2.example.com",
]);

const rxReq = createRxForwardReq();

rxNostr.use(rxReq).subscribe((packet) => {
  // This is your application!
  console.log(packet);
});

// Emit a REQ message to listen kind1 events.
rxReq.emit({ kinds: [1] });
```

Added lines 16 and 17. It's simple code.
This will cause `RxReq` to send one `ReqPacket` to `RxNostr`. `RxNostr` will establish and subscribe to a REQ subscription based on the Packet received, and the subscribed event will be consumed on line 13. Congratulations! You now have an application that displays a timeline!

But just wait a moment, there is only one last task left to do. The subscription will continue forever, and a CLOSE message must be sent.

In rx-nostr, you can CLOSE all REQs associated with `use()` by `unsubscribe()` the result of `subscribe()`. It is a bit awkward, but let's say we want to CLOSE after 10 seconds. Add the following code:

```js:line-numbers{11,19-22}
import { createRxNostr, createRxForwardReq } from "rx-nostr";

const rxNostr = createRxNostr();
rxNostr.setDefaultRelays([
  "wss://relay1.example.com",
  "wss://relay2.example.com",
]);

const rxReq = createRxForwardReq();

const subscription = rxNostr.use(rxReq).subscribe((packet) => {
  // This is your application!
  console.log(packet);
});

// Emit a REQ message to listen kind1 events.
rxReq.emit({ kinds: [1] });

// Emit CLOSE in 10 seconds.
setTimeout(() => {
  subscription.unsubscribe();
}, 10 * 1000);
```

This will work well!
