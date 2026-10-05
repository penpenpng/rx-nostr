import {
  type MonoTypeOperatorFunction,
  type Observable,
  type OperatorFunction,
  Subject,
} from "rxjs";

import type { LazyFilter } from "../lazy-filter/index.ts";
import { normalizeFilters } from "../lazy-filter/normalize-filters.ts";
import { createPipeMethod, type IPipeable, once, RxDisposableStack } from "../libs/index.ts";
import type { ReqOptions, ReqPacket } from "../packets/index.ts";

const DERIVED = Symbol("RxReq.derived");

export class RxReq implements IPipeable<RxReq, ReqPacket> {
  protected stack = new RxDisposableStack();
  protected stream: Subject<ReqPacket>;
  readonly #lifetimes: readonly RxDisposableStack[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected operators: OperatorFunction<any, any>[] = [];

  constructor();
  constructor(token: typeof DERIVED, parent: RxReq);
  constructor(token?: typeof DERIVED, parent?: RxReq) {
    if (token === DERIVED && parent) {
      this.stream = parent.stream;
      this.#lifetimes = [...parent.#lifetimes, this.stack];
    } else {
      this.stream = this.stack.add(new Subject());
      this.#lifetimes = [this.stack];
    }
  }

  asObservable(): Observable<ReqPacket> {
    let source = this.stream.pipe(...(this.operators as [])) as Observable<ReqPacket>;

    // Keep disposal after the operator chain so queued timer/buffer output is cancelled.
    for (const lifetime of this.#lifetimes) {
      source = source.pipe(lifetime.untilDisposed() as MonoTypeOperatorFunction<ReqPacket>);
    }

    return source;
  }

  /** Emit a segment. Empty/invalid branches match nothing without broadening to `{}`. */
  emit(filters: LazyFilter | LazyFilter[], options?: ReqOptions) {
    if (this.stack.disposed) {
      return;
    }

    this.stream.next({
      filters: normalizeFilters(filters),
      ...options,
    });
  }

  /** Create a view whose disposal stops its observers without disposing the source. */
  pipe = createPipeMethod<RxReq, ReqPacket>((...operators) => {
    const rxq = new RxReq(DERIVED, this);

    rxq.operators = [...this.operators, ...operators];

    return rxq;
  });

  [Symbol.dispose] = once(() => this.stack.dispose());
  dispose = this[Symbol.dispose];
}
