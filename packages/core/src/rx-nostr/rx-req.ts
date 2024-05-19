import * as Nostr from "nostr-typedef";
import { Observable, of, type OperatorFunction, Subject } from "rxjs";

import { LazyFilter, ReqPacket } from "../packet.js";
import type { Override } from "../utils.js";

/**
 * The RxReq interface that is provided for RxNostr (**not for users**).
 */
export interface RxReq<S extends RxReqStrategy = RxReqStrategy> {
  /** @internal User should not use this directly. The RxReq strategy. It is read-only and must not change. */
  strategy: S;
  /** @internal User should not use this directly. Used to construct subId. */
  rxReqId: string;
  /** @internal User should not use this directly. Get an Observable of ReqPacket. */
  getReqPacketObservable(): Observable<ReqPacket>;
}

/**
 * REQ strategy.
 *
 * See comments on `createRxForwardReq()`, `createRxBackwardReq()` and `createRxOneshotReq()
 */
export type RxReqStrategy = "forward" | "backward";

export interface RxReqPipeable {
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

export type RxReqEmittable<O = void> = O extends void
  ? {
      /** Start new REQ on the RxNostr with which the RxReq is associated. */
      emit(filters: LazyFilter | LazyFilter[]): void;
    }
  : {
      /** Start new REQ on the RxNostr with which the RxReq is associated. */
      emit(filters: LazyFilter | LazyFilter[], options?: O): void;
    };

/**
 * Notify RxNostr that it does not intend to send any more REQs.
 * The Observable that returned by `use()` is complete
 * when all REQs that have already been sent have been completed.
 */
export interface RxReqOverable {
  over(): void;
}

const createRxReq = <S extends RxReqStrategy>(params: {
  strategy: S;
  rxReqId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  operators?: OperatorFunction<any, any>[];
  subject?: Subject<ReqPacket>;
}): RxReq<S> &
  RxReqEmittable<{ relays: string[] }> &
  RxReqOverable &
  RxReqPipeable => {
  const { strategy } = params;
  const _operators = params.operators ?? [];
  const rxReqId = params.rxReqId ?? getRandomDigitsString();

  const filters$ = params.subject ?? new Subject<ReqPacket>();

  return {
    strategy,
    rxReqId,
    getReqPacketObservable(): Observable<ReqPacket> {
      return filters$.pipe(...(_operators as []));
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pipe(...operators: OperatorFunction<any, any>[]): RxReq {
      return createRxReq({
        strategy,
        rxReqId,
        operators: [..._operators, ...operators],
        subject: filters$,
      });
    },
    emit(filters: LazyFilter | LazyFilter[], options?: { relays: string[] }) {
      filters$.next({ filters: normalizeFilters(filters), ...(options ?? {}) });
    },
    over() {
      filters$.complete();
    },
  };
};

/**
 * Create a RxReq instance based on the backward strategy.
 * It is useful if you want to retrieve past events that have already been published.
 *
 * In backward strategy:
 * - All REQs have different subIds.
 * - All REQ-subscriptions keep alive until timeout or getting EOSE.
 * - In most cases, you should specify `until` or `limit` for filters.
 *
 * For more information, see [document](https://penpenpng.github.io/rx-nostr/v1/req-strategy.html#backward-strategy).
 */
export function createRxBackwardReq(
  rxReqId?: string
): RxReq<"backward"> &
  RxReqEmittable<{ relays: string[] }> &
  RxReqOverable &
  RxReqPipeable {
  return createRxReq({
    strategy: "backward",
    rxReqId,
  });
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
 * For more information, see [document](https://penpenpng.github.io/rx-nostr/v1/req-strategy.html#forward-strategy).
 */
export function createRxForwardReq(
  rxReqId?: string
): RxReq<"forward"> & RxReqEmittable & RxReqPipeable {
  return createRxReq({
    strategy: "forward",
    rxReqId,
  });
}

/**
 * Create a RxReq instance based on the oneshot strategy.
 * It is almost the same as backward strategy, however can publish only one REQ
 * and the Observable completes on EOSE.
 *
 * For more information, see [document](https://penpenpng.github.io/rx-nostr/v1/req-strategy.html#oneshot-strategy).
 */
export function createRxOneshotReq(params: {
  filters: LazyFilter | LazyFilter[];
  rxReqId?: string;
}): RxReq<"backward"> {
  return {
    strategy: "backward",
    rxReqId: params.rxReqId ?? getRandomDigitsString(),
    getReqPacketObservable: () =>
      of({ filters: normalizeFilters(params.filters) }),
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

  return res;
}

function normalizeFilters(filters: LazyFilter | LazyFilter[]): LazyFilter[] {
  return (Array.isArray(filters) ? filters : [filters])
    .map((e) => normalizeFilter(e))
    .filter((e): e is LazyFilter => e !== null);
}
