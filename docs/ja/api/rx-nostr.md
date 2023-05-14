# RxNostr

## `createRxNostr(options?)`

```ts
function createRxNostr(options?: { retry?: number; timeout?: number }): RxNostr;
```

`RxNostr` インスタンスを作成します。`RxNostr` クラスは export されていないので、このファクトリ関数が `RxNostr` インスタンスを作成する唯一の方法です。

| params  | 型     |                                                                                                                      |
| ------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| retry   | number | websocket が切断されたときに再接続を試みる回数です。デフォルトは `10`。                                              |
| timeout | number | Backward Strategy において、最後に EVENT を観測してから CLOSE するまでのミリ秒単位の時間です。デフォルトは `10000`。 |

## `class RxNostr`

### `setRelays(relays)`

### `getRelays()`

### `addRelay(relay)`

### `removeRelay(url)`

### `use(rxReq)`

### `createAllEventObservable()`

### `createAllErrorObservable()`

### `createAllMessageObservable()`

### `send(params, seckey?)`
