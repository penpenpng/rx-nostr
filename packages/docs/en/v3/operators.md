# Operators

The `subscribe()`-able objects in rx-nostr are actually Observable instances of RxJS. These and `RxReq` instances all have a `pipe()` method, so RxJS [operator](https://rxjs.dev/guide/operators) is applicable, which supports advanced use cases.

::: tip RxJS Tips
operator is a function from Observable to Observable. It can be passed to `pipe()` to declaratively process various Packets before they are `subscribe()`. See the RxJS documentation for details.
:::

Not only the standard RxJS operators, but also those provided by rx-nostr or user-defined ones can be used as well.
