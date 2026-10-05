import { type Observable, type OperatorFunction, Subject } from "rxjs";

import type { LazyFilter } from "../lazy-filter/index.ts";
import { normalizeFilters } from "../lazy-filter/normalize-filters.ts";
import { createPipeMethod, type IPipeable, once, RxDisposableStack } from "../libs/index.ts";
import type { ReqOptions, ReqPacket } from "../packets/index.ts";

export class RxReq implements IPipeable<RxReq, ReqPacket> {
  protected stack = new RxDisposableStack();
  protected stream: Subject<ReqPacket> = this.stack.add(new Subject());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected operators: OperatorFunction<any, any>[] = [];

  asObservable(): Observable<ReqPacket> {
    return this.stream.pipe(...(this.operators as []));
  }

  /** Emit a segment. Empty/invalid branches match nothing without broadening to `{}`. */
  emit(filters: LazyFilter | LazyFilter[], options?: ReqOptions) {
    this.stream.next({
      filters: normalizeFilters(filters),
      ...options,
    });
  }

  pipe = createPipeMethod<RxReq, ReqPacket>((...operators) => {
    const rxq = new RxReq();

    rxq.stream = this.stream;
    rxq.operators = [...this.operators, ...operators];

    return rxq;
  });

  [Symbol.dispose] = once(() => this.stack.dispose());
  dispose = this[Symbol.dispose];
}
