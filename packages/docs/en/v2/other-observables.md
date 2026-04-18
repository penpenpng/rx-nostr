# Other Observables

rx-nostr has several other `subscribe()`-able objects.

::: tip RxJS Tips
These are all Observable of RxJS. They are not completed until `rxNostr.dispose()` is explicitly called, and nothing happens when `unsubscribe()` is called.
:::

## createAllMessageObservable()

`rxNostr.createAllMessageObservable()` allows you to observe all incoming messages (including unknown type messages).

## createAllEventObservable()

`rxNostr.createAllEventObservable()` allows you to observe all EVENT message.

## createAllErrorObservable()

`rxNostr.createAllErrorObservable()` allows you to observe errors.Typically, these are errors that occur when a relay returns invalid JSON.

::: tip RxJS Tips
The Observable returned by `rxNostr.use()` is not terminated with an error. This is to prevent the entire Observable from stopping due to an error caused by any one relay.
:::
