import Nostr from "nostr-typedef";
import { BehaviorSubject, Observable, of, type OperatorFunction } from "rxjs";

import { LazyFilter, ReqPacket } from "./packet.js";
import type { Override } from "./utils.js";

/**
 * The RxReq interface that is provided for RxNostr (**not for users**).
 */
export interface RxReq<S extends RxReqStrategy = RxReqStrategy> {
  /** @internal User should not use this directly. The RxReq strategy. It is read-only and must not change. */
  strategy: S;
  /** @internal User should not use this directly. Used to construct subId. */
  rxReqId: string;
  /** @internal User should not use this directly. Get an Observable of ReqPacket. */
  getReqObservable(): Observable<ReqPacket>;
}

/**
 * REQ strategy.
 *
 * See comments on `createRxForwardReq()`, `createRxBackwardReq()` and `createRxOneshotReq()
 */
export type RxReqStrategy = "forward" | "backward";

/**
 * The RxReq interface that is provided for users (not for RxNostr).
 */
export interface RxReqController {
  /** Start new REQ on the RxNostr with witch the RxReq is associated. */
  emit(filters: LazyFilter | LazyFilter[]): void;

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
  pipe<A, B, C, D, E>(
    op1: OperatorFunction<ReqPacket, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>,
    op4: OperatorFunction<C, D>,
    op5: OperatorFunction<D, E>,
    op6: OperatorFunction<E, ReqPacket>
  ): RxReq;
  pipe<A, B, C, D, E, F>(
    op1: OperatorFunction<ReqPacket, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>,
    op4: OperatorFunction<C, D>,
    op5: OperatorFunction<D, E>,
    op6: OperatorFunction<E, F>,
    op7: OperatorFunction<F, ReqPacket>
  ): RxReq;
  pipe<A, B, C, D, E, F, G>(
    op1: OperatorFunction<ReqPacket, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>,
    op4: OperatorFunction<C, D>,
    op5: OperatorFunction<D, E>,
    op6: OperatorFunction<E, F>,
    op7: OperatorFunction<F, G>,
    op8: OperatorFunction<G, ReqPacket>
  ): RxReq;
  pipe<A, B, C, D, E, F, G, H>(
    op1: OperatorFunction<ReqPacket, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>,
    op4: OperatorFunction<C, D>,
    op5: OperatorFunction<D, E>,
    op6: OperatorFunction<E, F>,
    op7: OperatorFunction<F, G>,
    op8: OperatorFunction<G, H>,
    op9: OperatorFunction<H, ReqPacket>
  ): RxReq;
}

class RxReqImpl<S extends RxReqStrategy> implements RxReq {
  protected filters$ = new BehaviorSubject<ReqPacket>(null);
  rxReqId: string;

  constructor(public strategy: S, rxReqId?: string) {
    this.rxReqId = rxReqId ?? getRandomDigitsString();
  }

  getReqObservable(): Observable<ReqPacket> {
    return this.filters$.asObservable();
  }

  emit(filters: LazyFilter | LazyFilter[]) {
    this.filters$.next(normalizeFilters(filters));
  }

  // #region pipe overloads
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
  pipe<A, B, C, D, E>(
    op1: OperatorFunction<ReqPacket, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>,
    op4: OperatorFunction<C, D>,
    op5: OperatorFunction<D, E>,
    op6: OperatorFunction<E, ReqPacket>
  ): RxReq;
  pipe<A, B, C, D, E, F>(
    op1: OperatorFunction<ReqPacket, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>,
    op4: OperatorFunction<C, D>,
    op5: OperatorFunction<D, E>,
    op6: OperatorFunction<E, F>,
    op7: OperatorFunction<F, ReqPacket>
  ): RxReq;
  pipe<A, B, C, D, E, F, G>(
    op1: OperatorFunction<ReqPacket, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>,
    op4: OperatorFunction<C, D>,
    op5: OperatorFunction<D, E>,
    op6: OperatorFunction<E, F>,
    op7: OperatorFunction<F, G>,
    op8: OperatorFunction<G, ReqPacket>
  ): RxReq;
  pipe<A, B, C, D, E, F, G, H>(
    op1: OperatorFunction<ReqPacket, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>,
    op4: OperatorFunction<C, D>,
    op5: OperatorFunction<D, E>,
    op6: OperatorFunction<E, F>,
    op7: OperatorFunction<F, G>,
    op8: OperatorFunction<G, H>,
    op9: OperatorFunction<H, ReqPacket>
  ): RxReq;
  // #endregion
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pipe(...operators: OperatorFunction<any, any>[]): RxReq {
    const { rxReqId, strategy } = this;

    return {
      rxReqId,
      strategy,
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
  rxReqId?: string
): RxReq<"backward"> & RxReqController {
  return new RxReqImpl("backward", rxReqId);
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
  rxReqId?: string
): RxReq<"forward"> & RxReqController {
  return new RxReqImpl("forward", rxReqId);
}

/**
 * Create a RxReq instance based on the oneshot strategy.
 * It is almost the same as backward strategy, however can publish only one REQ
 * and the Observable completes on EOSE.
 *
 * For more information, see [document](https://penpenpng.github.io/rx-nostr/docs/req-strategy.html#oneshot-strategy).
 */
export function createRxOneshotReq(params: {
  filters: LazyFilter | LazyFilter[];
  /** @deprecated Use `rxReqId` instead */
  subId?: string;
  rxReqId?: string;
}): RxReq<"backward"> {
  return {
    strategy: "backward",
    rxReqId: params.rxReqId ?? params.subId ?? getRandomDigitsString(),
    getReqObservable: () => of(normalizeFilters(params.filters)),
  };
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
  filters: LazyFilter | LazyFilter[]
): LazyFilter[] | null {
  if (!filters) {
    return null;
  }
  const normalized = (Array.isArray(filters) ? filters : [filters]).flatMap(
    (e) => normalizeFilter(e) ?? []
  );
  return normalized.length > 0 ? normalized : null;
}
