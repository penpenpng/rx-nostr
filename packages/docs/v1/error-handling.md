# Error Handling

::: danger Caution
このドキュメントは rx-nostr 1.x のものです。2.x のドキュメントは[こちら](../v2/)を参照してください。
:::

`rxNostr.use()` の戻り値を始めとして `RxNostr` が発行する Observable は原則として error で終了しません。これはどこか 1 つのリレーに起因するエラーによって Observable 全体が停止しないようにするためです。代わりに `rxNostr.createAllErrorObservable()` を通じてエラーを監視することができます。
