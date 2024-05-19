# Other Observables

rx-nostr には他にもいくつか `subscribe()` 可能なオブジェクトがあります。

::: tip RxJS Tips
これらはすべて RxJS の Observable です。明示的に `rxNostr.dispose()` が呼ばれるまで complete せず、`unsubscribe()` を呼ばれても何も起こりません。
:::

## createAllMessageObservable()

`rxNostr.createAllMessageObservable()` によって、リレーから送られてきた (未知のタイプのメッセージを含む) すべてのメッセージを監視できます。

## createAllMessageObservable()

`rxNostr.createAllMessageObservable()` によって、リレーから送られてきたすべての EVENT メッセージを監視できます。

## createAllErrorObservable()

`rxNostr.createAllErrorObservable()` によってエラーを監視することができます。典型的には、これらはリレーが不正な JSON を返したときに発生するエラーです。

::: tip RxJS Tips
`rxNostr.use()` が返す Observable は error で終了しません。これは、どこかひとつのリレーに起因するエラーによって Observable 全体が停止しないようにするためです。
:::
