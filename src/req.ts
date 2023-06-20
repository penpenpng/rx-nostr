import { BehaviorSubject, Observable, OperatorFunction } from "rxjs";

import { Nostr } from "./nostr/primitive";
import { ReqPacket } from "./packet";
import type { Override } from "./util";

/**
 * The RxReq interface that is provided for RxNostr (not for users).
 */
export interface RxReq<S extends RxReqStrategy = RxReqStrategy> {
  /** The RxReq strategy. It is read-only and must not change. */
  get strategy(): S;
  /** Used to construct subId. */
  get rxReqId(): string;
  /** Get an Observable of ReqPacket. */
  getReqObservable(): Observable<ReqPacket>;

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

export type RxReqStrategy = "forward" | "backward" | "oneshot";

/**
 * The RxReq interface that is provided for users (not for RxNostr).
 */
export interface RxReqController {
  /** Start new REQ or stop REQ on the RxNostr with witch the RxReq is associated. */
  emit(filters: Nostr.Filter[] | null): void;
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

  emit(filters: Nostr.Filter[] | null) {
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

export function createRxBackwardReq(
  subIdBase?: string
): RxReq<"backward"> & RxReqController {
  return new RxBackwardReq(subIdBase);
}

/**
 * Base class for RxReq based on the backward strategy.
 * This is useful if you want to retrieve past events that have already been published.
 *
 * In backward strategy:
 * - All REQs have different subIds.
 * - All subscriptions keep alive until timeout or getting EOSE.
 * - Observable corresponding to each time REQ is flattened by `mergeAll()`.
 *     - https://rxjs.dev/api/operators/mergeAll
 * - In most cases, you should specify `limit` for filters.
 */
class RxBackwardReq extends RxReqBase implements RxReqController {
  constructor(rxReqId?: string) {
    super(rxReqId);
  }

  override get strategy(): "backward" {
    return "backward";
  }
}

export function createRxForwardReq(
  subId?: string
): RxReq<"forward"> & RxReqController {
  return new RxForwardReq(subId);
}

/**
 * Base class for RxReq based on the forward strategy.
 * This is useful if you want to listen future events.
 *
 * In forward strategy:
 * - All REQs have the same subId.
 * - When a new REQ is issued, the old REQ is overwritten and terminated immediately.
 *   The latest REQ keeps alive until it is overwritten or explicitly terminated.
 * - Observable corresponding to each time REQ is flattened by `switchAll()`.
 *     - https://rxjs.dev/api/operators/switchAll
 * - In most cases, you should not specify `limit` for filters.
 */
class RxForwardReq extends RxReqBase implements RxReqController {
  constructor(rxReqId?: string) {
    super(rxReqId);
  }

  override get strategy(): "forward" {
    return "forward";
  }
}

export function createRxOneshotReq(req: {
  filters: Nostr.Filter[];
  subId?: string;
}): RxReq<"oneshot"> {
  return new RxOneshotReq(req);
}

class RxOneshotReq extends RxReqBase {
  constructor(req: { filters: Nostr.Filter[]; subId?: string }) {
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

export function mixin<R extends object, T extends object>(
  def: () => ThisType<R> & T
): Mixin<R, T> {
  return def;
}

export function extend<B extends R, R extends object, T extends object>(
  base: B,
  mixin: Mixin<R, T>
): Override<B, T> {
  return Object.assign(base, mixin()) as Override<B, T>;
}

function getRandomDigitsString() {
  return `${Math.floor(Math.random() * 1000000)}`;
}

function normalizeFilter(filter: Nostr.Filter): Nostr.Filter | null {
  const res: Nostr.Filter = {};
  for (const [key, value] of Object.entries(filter)) {
    if (
      (key === "since" || key === "until" || key === "limit") &&
      (value ?? -1) >= 0
    ) {
      res[key] = value;
      continue;
    }
    if (
      ((key.startsWith("#") && key.length === 2) ||
        key === "ids" ||
        key === "kinds" ||
        key === "authors") &&
      value &&
      value.length > 0
    ) {
      res[key as "ids" | "kinds" | "authors" | `#${string}`] = value;
      continue;
    }
  }

  const timeRangeIsValid = !res.since || !res.until || res.since <= res.until;
  if (!timeRangeIsValid) {
    return null;
  }

  if (Object.keys(res).length <= 0) {
    return null;
  }

  return res;
}

function normalizeFilters(
  filters: Nostr.Filter[] | null
): Nostr.Filter[] | null {
  if (!filters) {
    return null;
  }
  const normalized = filters.flatMap((e) => normalizeFilter(e) ?? []);
  return normalized.length > 0 ? normalized : null;
}
