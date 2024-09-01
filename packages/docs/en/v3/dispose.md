# Dispose

`RxNostr` and `VerificationServiceClient` (See [Verifier](./verifier)) are `dispose()`-able object. `dispose()`-able objects should be `dispose()`'d when they get to be no longer used.

`dispose()` releases all resource and makes the object unavailable. In `RxNostr` case, it closes all WebSocket connection immediately.

All `dispose()`-able objects support [`using` keyword](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html#using-declarations-and-explicit-resource-management).
