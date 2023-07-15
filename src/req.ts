import Nostr from "nostr-typedef";
import { BehaviorSubject, Observable, OperatorFunction } from "rxjs";

import { LazyFilter, ReqPacket } from "./packet";
import type { Override } from "./util";

/**
 * The RxReq interface that is provided for RxNostr (**not for users**).
 */
export interface RxReq<S extends RxReqStrategy = RxReqStrategy> {
  /** @internal User should not use this directly.The RxReq strategy. It is read-only and must not change. */
  get strategy(): S;
  /** @internal User should not use this directly. Used to construct subId. */
  get rxReqId(): string;
  /** @internal User should not use this directly. Get an Observable of ReqPacket. */
  getReqObservable(): Observable<ReqPacket>;
}

/**
 * REQ strategy.
 *
 * See comments on `createRxForwardReq()`, `createRxBackwardReq()` and `createRxOneshotReq()
 */
export type RxReqStrategy = "forward" | "backward" | "oneshot";

/**
 * The RxReq interface that is provided for users (not for RxNostr).
 */
export interface RxReqController {
  /** Start new REQ or stop REQ on the RxNostr with witch the RxReq is associated. */
  emit(filters: LazyFilter | LazyFilter[] | null): void;

  /**
   * Returns itself overriding only `getReqObservable()`.
   * It is useful for throttling and other control purposes.
   */
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

abstract class RxReqBase implements RxReq {
  protected filters$ = new BehaviorSubject<ReqPacket>(null);
  private _rxReqId: string;

  abstract get strategy(): RxReqStrategy;
  get rxReqId() {
    return this._rxReqId;
  }

  constructor(rxReqId?: string) {
    this._rxReqId = rxReqId ?? getRandomDigitsString();
  }

  getReqObservable(): Observable<ReqPacket> {
    return this.filters$.asObservable();
  }

  emit(filters: LazyFilter | LazyFilter[] | null) {
    const normalized = normalizeFilters(filters);

    if (normalized) {
      this.filters$.next(normalized);
    } else {
      this.filters$.next(null);
    }
  }

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pipe(...operators: OperatorFunction<any, any>[]): RxReq {
    const rxReqId = this.rxReqId;
    const strategy = this.strategy;
    return {
      ...this,
      get rxReqId() {
        return rxReqId;
      },
      get strategy() {
        return strategy;
      },
      getReqObservable: () =>
        this.getReqObservable().pipe(...(operators as [])),
    };
  }
}

/**
 * Create a RxReq instance based on the backward strategy.
 * It is useful if you want to retrieve past events that have already been published.
 *
 * In backward strategy:
 * - All REQs have different subIds.
 * - All REQ-subscriptions keep alive until timeout or getting EOSE.
 * - In most cases, you should specify `until` or `limit` for filters.
 *
 * For more information, see [document](https://penpenpng.github.io/rx-nostr/docs/req-strategy.html#backward-strategy).
 */
export function createRxBackwardReq(
  subIdBase?: string
): RxReq<"backward"> & RxReqController {
  return new RxBackwardReq(subIdBase);
}

class RxBackwardReq extends RxReqBase implements RxReqController {
  constructor(rxReqId?: string) {
    super(rxReqId);
  }

  override get strategy(): "backward" {
    return "backward";
  }
}

/**
 * Create a RxReq instance based on the forward strategy.
 * It is useful if you want to listen future events.
 *
 * In forward strategy:
 * - All REQs have the same subId.
 * - When a new REQ is issued, the old REQ is overwritten and terminated immediately.
 *   The latest REQ keeps alive until it is overwritten or explicitly terminated.
 * - In most cases, you should not specify `limit` for filters.
 *
 * For more information, see [document](https://penpenpng.github.io/rx-nostr/docs/req-strategy.html#forward-strategy).
 */
export function createRxForwardReq(
  subId?: string
): RxReq<"forward"> & RxReqController {
  return new RxForwardReq(subId);
}

class RxForwardReq extends RxReqBase implements RxReqController {
  constructor(rxReqId?: string) {
    super(rxReqId);
  }

  override get strategy(): "forward" {
    return "forward";
  }
}

/**
 * Create a RxReq instance based on the oneshot strategy.
 * It is almost the same as backward strategy, however can publish only one REQ
 * and the Observable completes on EOSE.
 *
 * For more information, see [document](https://penpenpng.github.io/rx-nostr/docs/req-strategy.html#oneshot-strategy).
 */
export function createRxOneshotReq(req: {
  filters: LazyFilter | LazyFilter[];
  subId?: string;
}): RxReq<"oneshot"> {
  return new RxOneshotReq(req);
}

class RxOneshotReq extends RxReqBase {
  constructor(req: { filters: LazyFilter | LazyFilter[]; subId?: string }) {
    super(req?.subId);
    this.emit(req.filters);
  }

  override get strategy(): "oneshot" {
    return "oneshot";
  }
}

export interface Mixin<R, T> {
  (): ThisType<R> & T;
}

/** NOTE: unstable feature */
export function mixin<R extends object, T extends object>(
  def: () => ThisType<R> & T
): Mixin<R, T> {
  return def;
}

/** NOTE: unstable feature */
export function extend<B extends R, R extends object, T extends object>(
  base: B,
  mixin: Mixin<R, T>
): Override<B, T> {
  return Object.assign(base, mixin()) as Override<B, T>;
}

function getRandomDigitsString() {
  return `${Math.floor(Math.random() * 1000000)}`;
}

function normalizeFilter(filter: LazyFilter): LazyFilter | null {
  const res: LazyFilter = {};
  const isTagName = (s: string): s is Nostr.TagName => /^#[a-zA-Z]$/.test(s);

  for (const key of Object.keys(filter)) {
    if (key === "limit" && (filter[key] ?? -1) >= 0) {
      res[key] = filter[key];
      continue;
    }
    if (key === "since" || key === "until") {
      const f = filter[key];
      if (typeof f !== "number" || (f ?? -1) >= 0) {
        res[key] = f;
        continue;
      }
    }
    if (
      (isTagName(key) || key === "ids" || key === "authors") &&
      filter[key] !== undefined &&
      (filter[key]?.length ?? -1) > 0
    ) {
      res[key] = filter[key];
      continue;
    }
    if (
      key === "kinds" &&
      filter[key] !== undefined &&
      (filter[key]?.length ?? -1) > 0
    ) {
      res[key] = filter[key];
      continue;
    }
    if (key === "search" && filter[key] !== undefined) {
      res[key] = filter[key];
      continue;
    }
  }

  const timeRangeIsValid =
    typeof res.since !== "number" ||
    typeof res.until !== "number" ||
    res.since <= res.until;
  if (!timeRangeIsValid) {
    return null;
  }

  if (Object.keys(res).length <= 0) {
    return null;
  }

  return res;
}

function normalizeFilters(
  filters: LazyFilter | LazyFilter[] | null
): LazyFilter[] | null {
  if (!filters) {
    return null;
  }
  const normalized = (Array.isArray(filters) ? filters : [filters]).flatMap(
    (e) => normalizeFilter(e) ?? []
  );
  return normalized.length > 0 ? normalized : null;
}
