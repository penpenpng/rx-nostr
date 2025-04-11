import type { Observable, OperatorFunction } from "rxjs";
import type { ReqPacket } from "../types/index.ts";

/**
 * The RxReq interface that is provided for RxNostr (**not for users**).
 */
export interface IRxReq {
  /** @internal User should not use this directly. The RxReq strategy. It is read-only and must not change. */
  strategy: RxReqStrategy;
  /** @internal User should not use this directly. Get an Observable of ReqPacket. */
  packets$: Observable<ReqPacket>;
}

export type RxReqStrategy = "forward" | "backward";

export interface IRxReqPipeable {
  pipe(): IRxReq;
  pipe(op1: OperatorFunction<ReqPacket, ReqPacket>): IRxReq;
  pipe<A>(op1: OperatorFunction<ReqPacket, A>, op2: OperatorFunction<A, ReqPacket>): IRxReq;
  pipe<A, B>(
    op1: OperatorFunction<ReqPacket, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, ReqPacket>,
  ): IRxReq;
  pipe<A, B, C>(
    op1: OperatorFunction<ReqPacket, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>,
    op4: OperatorFunction<C, ReqPacket>,
  ): IRxReq;
  pipe<A, B, C, D>(
    op1: OperatorFunction<ReqPacket, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>,
    op4: OperatorFunction<C, D>,
    op5: OperatorFunction<D, ReqPacket>,
  ): IRxReq;
  pipe<A, B, C, D, E>(
    op1: OperatorFunction<ReqPacket, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>,
    op4: OperatorFunction<C, D>,
    op5: OperatorFunction<D, E>,
    op6: OperatorFunction<E, ReqPacket>,
  ): IRxReq;
  pipe<A, B, C, D, E, F>(
    op1: OperatorFunction<ReqPacket, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>,
    op4: OperatorFunction<C, D>,
    op5: OperatorFunction<D, E>,
    op6: OperatorFunction<E, F>,
    op7: OperatorFunction<F, ReqPacket>,
  ): IRxReq;
  pipe<A, B, C, D, E, F, G>(
    op1: OperatorFunction<ReqPacket, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>,
    op4: OperatorFunction<C, D>,
    op5: OperatorFunction<D, E>,
    op6: OperatorFunction<E, F>,
    op7: OperatorFunction<F, G>,
    op8: OperatorFunction<G, ReqPacket>,
  ): IRxReq;
  pipe<A, B, C, D, E, F, G, H>(
    op1: OperatorFunction<ReqPacket, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>,
    op4: OperatorFunction<C, D>,
    op5: OperatorFunction<D, E>,
    op6: OperatorFunction<E, F>,
    op7: OperatorFunction<F, G>,
    op8: OperatorFunction<G, H>,
    op9: OperatorFunction<H, ReqPacket>,
  ): IRxReq;
}
