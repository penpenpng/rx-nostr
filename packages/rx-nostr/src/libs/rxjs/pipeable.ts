import type { OperatorFunction } from "rxjs";

export interface PipeMethod<T, S, R = S> {
  (): T;
  (op1: OperatorFunction<S, R>): T;
  <A>(op1: OperatorFunction<S, A>, op2: OperatorFunction<A, R>): T;
  <A, B>(op1: OperatorFunction<S, A>, op2: OperatorFunction<A, B>, op3: OperatorFunction<B, R>): T;
  <A, B, C>(
    op1: OperatorFunction<S, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>,
    op4: OperatorFunction<C, R>,
  ): T;
  <A, B, C, D>(
    op1: OperatorFunction<S, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>,
    op4: OperatorFunction<C, D>,
    op5: OperatorFunction<D, R>,
  ): T;
  <A, B, C, D, E>(
    op1: OperatorFunction<S, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>,
    op4: OperatorFunction<C, D>,
    op5: OperatorFunction<D, E>,
    op6: OperatorFunction<E, R>,
  ): T;
  <A, B, C, D, E, F>(
    op1: OperatorFunction<S, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>,
    op4: OperatorFunction<C, D>,
    op5: OperatorFunction<D, E>,
    op6: OperatorFunction<E, F>,
    op7: OperatorFunction<F, R>,
  ): T;
  <A, B, C, D, E, F, G>(
    op1: OperatorFunction<S, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>,
    op4: OperatorFunction<C, D>,
    op5: OperatorFunction<D, E>,
    op6: OperatorFunction<E, F>,
    op7: OperatorFunction<F, G>,
    op8: OperatorFunction<G, R>,
  ): T;
  <A, B, C, D, E, F, G, H>(
    op1: OperatorFunction<S, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>,
    op4: OperatorFunction<C, D>,
    op5: OperatorFunction<D, E>,
    op6: OperatorFunction<E, F>,
    op7: OperatorFunction<F, G>,
    op8: OperatorFunction<G, H>,
    op9: OperatorFunction<H, R>,
  ): T;
}

export interface IPipeable<T, S, R = S> {
  pipe: PipeMethod<T, S, R>;
}

export function createPipeMethod<T, S = unknown, R = S>(
  pipe: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...operators: OperatorFunction<any, any>[]
  ) => T,
): PipeMethod<T, S, R> {
  return pipe;
}
