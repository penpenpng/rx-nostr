# RxReq

## function

### createRxForwardReq() [#create-rx-forward-req]

```ts
function createRxForwardReq(subId?: string): RxReq<"forward"> & RxReqController;
```

### createRxBackwardReq() [#create-rx-backward-req]

```ts
function createRxBackwardReq(
  subIdBase?: string
): RxReq<"backward"> & RxReqController;
```

### createRxOneshotReq() [#create-rx-oneshot-req]

```ts
function createRxOneshotReq(req: {
  filters: Nostr.Filter[];
  subId?: string;
}): RxReq<"oneshot">;
```

## interface

### RxReq\<S\> [#rx-req]

```ts
interface RxReq<S extends RxReqStrategy = RxReqStrategy> {
  get strategy(): S;
  get rxReqId(): string;
  getReqObservable(): Observable<ReqPacket>;
  pipe(): RxReq;
  pipe(op1: OperatorFunction<ReqPacket, ReqPacket>): RxReq;
  pipe<A>(
    op1: OperatorFunction<ReqPacket, A>,
    op2: OperatorFunction<A, ReqPacket>
  ): RxReq;
  pipe<A, B>(
    op1: OperatorFunction<ReqPacket, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, ReqPacket>
  ): RxReq;
  pipe<A, B, C>(
    op1: OperatorFunction<ReqPacket, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>,
    op4: OperatorFunction<C, ReqPacket>
  ): RxReq;
  pipe<A, B, C, D>(
    op1: OperatorFunction<ReqPacket, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>,
    op4: OperatorFunction<C, D>,
    op5: OperatorFunction<D, ReqPacket>
  ): RxReq;
}

type RxReqStrategy = "forward" | "backward" | "oneshot";
```

#### strategy [#strategy]

#### rxReqId [#rx-req-id]

#### getReqObservable() [#get-req-observable]

#### pipe() [#pipe]

### RxReqController [#rx-req-controller]

```ts
interface RxReqController {
  emit(filters: Nostr.Filter[] | null): void;
}
```
