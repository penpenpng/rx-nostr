# Why rx-nostr?

It is because, in short, **NIP-01 is simple but not easy**.
rx-nostr is a library to make NIP-01 as easy to handle as possible while keeping all the possibilities of the protocol.

More specifically, rx-nostr is a communication client that sends REQ, EVENT, CLOSE, and possibly AUTH to receive EVENT, OK, and CLOSED.
Thus, for example, it does not directly provide application-level operations such as fetching someone's follow list or updating their status.
Instead, it provides almost complete control over communication-level operations, such as what payload is sent to which relay and by how procedure.
The control is useful for the developer to directly optimize the application's performance.

## Why NIP-01 is Not Easy?

But what in the world is not easy about NIP-01?
Indeed, at first glance, the specification seems to require only an extremely simple implementation, since all the application has to do is "send REQ then receive EVENT, and send EVENT then receive OK".
The standard WebSocket class seems to be enough to do.
In reality, however, real-world applications also require the following implementations:

- Communicate with multiple relays.
- However, [clients SHOULD open a single websocket connection to each relay](https://github.com/nostr-protocol/nips/blob/8184749f5b336117ae4cedc72be28a9875a004d3/01.md#:~:text=Clients%20SHOULD%20open%20a%20single%20websocket%20connection%20to%20each%20relay).
- Reconstruct ongoing communications if user changes the application's relay setting.
- Queue REQ requests as needed to ensure that the number of concurrent REQ subscriptions does not exceed [the limit of relays](https://github.com/nostr-protocol/nips/blob/8184749f5b336117ae4cedc72be28a9875a004d3/11.md#server-limitations).
- Specify the target relay to communicate with, for each message.
- Send CLOSE after confirming OK, if needed.
- Authenticate by [AUTH](https://github.com/nostr-protocol/nips/blob/master/42.md)
- Handle CLOSED messages.
- When a connection to a relay is unintentionally dropped, reconnect and then reestablish the communication that was in progress immediately before.
- When reconnecting, reconnect [in the manner recommended by the RFC](https://www.rfc-editor.org/rfc/rfc6455.html#section-7.2.3)
- Validate that events returned from relays really match the filters conditions
- Ignore [expired events](https://github.com/nostr-protocol/nips/blob/master/40.md).
- Verify the signature of events.

rx-nostr handles all of this transparently.
Thus, now all you really have to do is "send REQ then receive EVENT, and send EVENT then receive OK".

## Work with RxJS

Common Web APIs such as REST provide one asynchronous output for each input.
This is abstracted as an asynchronous function that returns a Promise in most cases.
However, in the case of Nostr, for one or more asynchronous inputs, there can be one or more asynchronous outputs.
This cannot be abstracted as a simple asynchronous function.
One of the best models for representing such inputs and outputs is [Subject](https://rxjs.dev/guide/subject) provided by [RxJS](https://rxjs.dev/).
The core API of rx-nostr is implemented as a kind of Subject.

However, it is not at all necessary to know about RxJS in order to use rx-nostr.
If you are familiar with RxJS, you can use the power of [Operator](https://rxjs.dev/guide/operators) to express complex requirements declaratively.
