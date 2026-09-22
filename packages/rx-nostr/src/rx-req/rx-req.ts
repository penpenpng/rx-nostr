import { concat, NEVER, type Observable, of, type OperatorFunction, Subject } from "rxjs";
import type { LazyFilter } from "../lazy-filter/index.ts";
import { createPipeMethod, type IPipeable, once, RxDisposableStack } from "../libs/index.ts";
import type { ReqOptions, ReqPacket } from "../packets/index.ts";
import { normalizeFilters } from "./normalize-filters.ts";

export type RxReqStrategy = "forward" | "backward";

export abstract class RxReq {
  abstract strategy: RxReqStrategy;
  abstract asObservable(): Observable<ReqPacket>;
}

abstract class RxPipeableReq extends RxReq implements IPipeable<RxReq, ReqPacket> {
  protected stack = new RxDisposableStack();
  protected stream: Subject<ReqPacket> = this.stack.add(new Subject());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected operators: OperatorFunction<any, any>[] = [];

  protected abstract create(): RxPipeableReq;

  asObservable(): Observable<ReqPacket> {
    return this.stream.pipe(...(this.operators as []));
  }

  emit(filters: LazyFilter | LazyFilter[], options?: ReqOptions) {
    this.stream.next({
      filters: normalizeFilters(filters),
      ...(options ?? {}),
    });
  }

  pipe = createPipeMethod<RxPipeableReq, ReqPacket>((...operators) => {
    const rxq = this.create();
    rxq.stream = this.stream;
    rxq.operators = [...this.operators, ...operators];

    return rxq;
  });

  [Symbol.dispose] = once(() => this.stack.dispose());
  dispose = this[Symbol.dispose];
}

export class RxForwardReq extends RxPipeableReq {
  readonly strategy = "forward";

  protected override create() {
    return new RxForwardReq();
  }
}

export class RxBackwardReq extends RxPipeableReq {
  readonly strategy = "backward";

  protected override create() {
    return new RxBackwardReq();
  }

  /**
   * Notify RxNostr that it does not intend to send any more REQs.
   * The Observable that returned by `use()` is complete
   * when all REQs that have already been sent have been completed.
   */
  over() {
    this.stream.complete();
  }
}

export class RxStaticReq extends RxReq {
  protected stream: Observable<ReqPacket>;

  constructor(
    readonly strategy: RxReqStrategy,
    filters: LazyFilter | LazyFilter[],
    options?: Pick<ReqOptions, "traceTag">,
  ) {
    super();

    const packet$ = of({
      filters: normalizeFilters(filters),
      ...(options ?? {}),
    });
    this.stream = strategy === "forward" ? concat(packet$, NEVER) : packet$;
  }

  asObservable(): Observable<ReqPacket> {
    return this.stream;
  }
}

export class RxOneshotReq extends RxStaticReq {
  constructor(filters: LazyFilter | LazyFilter[], options?: Pick<ReqOptions, "traceTag">) {
    super("backward", filters, options);
  }
}
