# Dispose

`RxNostr` と `VerificationServiceClient` ([Verifier](./verifier) を参照してください) は `dispose()` 可能なオブジェクトです。`dispose()` 可能なオブジェクトはそれがもう使用されなくなったタイミングで `dispose()` されることが望ましいです。

`dispose()` されると、それが使用していたすべてのリソースは解放され、再利用が不可能になります。`RxNostr` の場合、すべての WebSocket 接続の速やかな切断処理が含まれます。

`dispose()` 可能なオブジェクトはすべて [`using` キーワード](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html#using-declarations-and-explicit-resource-management)に対応しています。
