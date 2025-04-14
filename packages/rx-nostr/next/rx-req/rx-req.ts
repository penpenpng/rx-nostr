import { type Observable, type OperatorFunction, Subject } from "rxjs";
import { only } from "../libs/only.ts";
import type { EmitScopeConnectionPolicy } from "../types/misc.ts";
import type { ReqPacket } from "../types/packet.ts";
import type { LazyFilter } from "../types/req.ts";
import { normalizeFilters } from "./normalize-filters.ts";
import type { IRxReq, IRxReqPipeable, RxReqStrategy } from "./rx-req.interface.ts";

abstract class RxReqBase implements IRxReq, IRxReqPipeable {
  abstract strategy: RxReqStrategy;
  protected disposables = new DisposableStack();
  protected inputs$: Subject<ReqPacket> = this.disposables.adopt(new Subject(), (v) => v.complete());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected operators: OperatorFunction<any, any>[] = [];

  protected abstract create(): RxReqBase;

  get packets$(): Observable<ReqPacket> {
    return this.inputs$.pipe(...(this.operators as []));
  }

  emit(filters: LazyFilter | LazyFilter[], policy?: EmitScopeConnectionPolicy) {
    this.inputs$.next({ filters: normalizeFilters(filters), policy });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pipe(...operators: OperatorFunction<any, any>[]): IRxReq {
    const rxreq = this.create();
    rxreq.inputs$ = this.inputs$;
    rxreq.operators = [...this.operators, ...operators];

    return rxreq;
  }

  [Symbol.dispose] = only(() => this.disposables.dispose());
  dispose = this[Symbol.dispose];
}

export class RxForwardReq extends RxReqBase {
  readonly strategy = "forward";

  protected override create() {
    return new RxForwardReq();
  }
}

export class RxBackwardReq extends RxReqBase {
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
    this.inputs$.complete();
  }
}
