import { type Observable, type OperatorFunction, Subject } from "rxjs";
import type { LazyFilter } from "../lazy-filter/index.ts";
import { once } from "../libs/once.ts";
import { createPipeMethod, type IPipeable } from "../libs/pipeable.ts";
import type { ReqPacket } from "../packets/index.ts";
import { RxRelays } from "../rx-relays/index.ts";
import { normalizeFilters } from "./normalize-filters.ts";
import type { IRxReq, RxReqStrategy } from "./rx-req.interface.ts";

abstract class RxReqBase implements IRxReq, IPipeable<IRxReq, ReqPacket> {
  abstract _strategy: RxReqStrategy;
  protected disposables = new DisposableStack();
  protected inputs$: Subject<ReqPacket> = this.disposables.adopt(
    new Subject(),
    (v) => v.complete(),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected operators: OperatorFunction<any, any>[] = [];

  protected abstract create(): RxReqBase;

  get _packets$(): Observable<ReqPacket> {
    return this.inputs$.pipe(...(this.operators as []));
  }

  emit(
    filters: LazyFilter | LazyFilter[],
    options?: { relays?: RxRelays | Iterable<string>; linger?: number },
  ) {
    const { relays, linger } = options ?? {};

    this.inputs$.next({
      filters: normalizeFilters(filters),
      relays,
      linger,
    });
  }

  pipe = createPipeMethod<IRxReq, ReqPacket>((...operators) => {
    const rxq = this.create();
    rxq.inputs$ = this.inputs$;
    rxq.operators = [...this.operators, ...operators];

    return rxq;
  });

  [Symbol.dispose] = once(() => this.disposables.dispose());
  dispose = this[Symbol.dispose];
}

export class RxForwardReq extends RxReqBase {
  readonly _strategy = "forward";

  protected override create() {
    return new RxForwardReq();
  }
}

export class RxBackwardReq extends RxReqBase {
  readonly _strategy = "backward";

  protected override create() {
    return new RxBackwardReq();
  }

  /**
   * Notify RxNostr that it does not intend to send any more REQs.
   * The Observable that returned by `use()` is complete
   * when all REQs that have already been sent have been completed.
   */
  over() {
    this.inputs$.complete();
  }
}
