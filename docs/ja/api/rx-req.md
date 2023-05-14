# RxReq

## `interface RxReq`

### `get strategy()`

### `getReqObservable()`

### `onConsumeReq(req)`

### `onReceiveEvent(event)`

## `interface RxReqController extends RxReq`

### `emit(filters)`

### `pipe(...operators)`

## `class RxBackwardReq implements RxReqController`

### `constructor(subIdBase?)`

## `class RxForwardReq implements RxReqController`

### `constructor(subId?)`
