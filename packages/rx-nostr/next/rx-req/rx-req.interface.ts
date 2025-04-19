import type { Observable } from "rxjs";
import type { ReqPacket } from "../packets/index.ts";

/**
 * The RxReq interface that is provided for RxNostr (**not for users**).
 */
export interface IRxReq {
  /** @internal User should not use this directly. The RxReq strategy. It is read-only and must not change. */
  _strategy: RxReqStrategy;
  /** @internal User should not use this directly. Get an Observable of ReqPacket. */
  _packets$: Observable<ReqPacket>;
}

export type RxReqStrategy = "forward" | "backward";
