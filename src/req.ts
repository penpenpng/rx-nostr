import { BehaviorSubject, Observable, of } from "rxjs";
import { v4 as uuid } from "uuid";

import { Nostr } from "./nostr/primitive";

export interface Req {
  readonly subId: string;
  readonly filters: Nostr.Filter[];
}

export interface ObservableReq {
  readonly subId: string;
  readonly filters: Nostr.Filter[];
  readonly observable: Observable<Req>;
  readonly strategy: ReqStrategy;
}

export type ReqStrategy = "until-eose" | "forever";

class ObservableReqBase {
  protected _subId: string;
  get subId() {
    return this._subId;
  }

  protected _filters: Nostr.Filter[];
  get filters() {
    return this._filters;
  }

  protected _strategy: ReqStrategy;
  get strategy() {
    return this._strategy;
  }

  constructor(params: {
    subId: string;
    filters: Nostr.Filter[];
    strategy: ReqStrategy;
  }) {
    this._subId = params.subId;
    this._filters = params.filters;
    this._strategy = params.strategy;
  }
}

export class ImmutableReq extends ObservableReqBase implements ObservableReq {
  private _req$: Observable<Req>;
  get observable() {
    return this._req$;
  }

  constructor(strategy: ReqStrategy, filters: Nostr.Filter[]) {
    super({
      subId: uuid(),
      filters: normalizeFilters(filters),
      strategy,
    });

    this._req$ = of({
      subId: this._subId,
      filters: this._filters,
    });
  }
}

export class ForwardReq extends ObservableReqBase implements ObservableReq {
  private _req$: BehaviorSubject<Req>;
  get observable() {
    return this._req$;
  }

  constructor(initial?: Nostr.Filter[]) {
    super({
      subId: uuid(),
      filters: normalizeFilters(initial ?? []),
      strategy: "forever",
    });

    this._req$ = new BehaviorSubject({
      subId: this._subId,
      filters: this._filters,
    });
  }

  setFilters(filters: Nostr.Filter[]) {
    this._req$.next({
      subId: this._subId,
      filters: filters.map((filter) => ({ ...filter, limit: 0 })),
    });
  }
}

// TODO: Reimpl as MonoFilterAccumulater
export class MonoFilterForwardReq
  extends ObservableReqBase
  implements ObservableReq
{
  private _req$: BehaviorSubject<Req>;
  get observable() {
    return this._req$;
  }

  get filter() {
    return this.filters[0] ?? {};
  }

  constructor(initial?: Nostr.Filter[]) {
    super({
      subId: uuid(),
      filters: normalizeFilters(initial ?? []),
      strategy: "forever",
    });

    this._req$ = new BehaviorSubject({
      subId: this._subId,
      filters: this._filters,
    });
  }

  set(target: "kinds", ...queries: number[]): void;
  set(target: "ids" | "authors" | Nostr.TagName, ...queries: string[]): void;
  set(
    target: "kinds" | "ids" | "authors" | Nostr.TagName,
    ...queries: string[] | number[]
  ): void {
    const prev = this.filter[target] ?? [];
    const next = Array.from(new Set([...prev, ...queries]));

    if (prev.length !== next.length) {
      this.setFilter({
        ...this.filter,
        [target]: next.length > 0 ? next : undefined,
      });
    }
  }

  remove(target: "kinds", ...queries: number[]): void;
  remove(target: "ids" | "authors" | Nostr.TagName, ...queries: string[]): void;
  remove(
    target: "kinds" | "ids" | "authors" | Nostr.TagName,
    ...queries: string[] | number[]
  ): void {
    const prev = this.filter[target] ?? [];
    const set = new Set<number | string>(prev);
    for (const q of queries) {
      set.delete(q);
    }
    const next = Array.from(set);

    if (prev.length !== next.length) {
      this.setFilter({
        ...this.filter,
        [target]: next.length > 0 ? next : undefined,
      });
    }
  }

  clear(target: "kinds" | "ids" | "authors" | Nostr.TagName) {
    const prev = this.filter[target] ?? [];

    if (prev.length > 0) {
      this.setFilter({
        ...this.filter,
        [target]: undefined,
      });
    }
  }

  setSince(datetime: number | Date | null): void {
    const prev = this.filter.since ?? null;
    const next =
      typeof datetime === "number" || datetime === null
        ? datetime
        : Math.floor(datetime.getTime() / 1000);

    if (prev !== next) {
      this.setFilter({
        ...this.filter,
        since: next ?? undefined,
      });
    }
  }
  setUntil(datetime: number | Date | null): void {
    const prev = this.filter.until ?? null;
    const next =
      typeof datetime === "number" || datetime === null
        ? datetime
        : Math.floor(datetime.getTime() / 1000);

    if (prev !== next) {
      this.setFilter({
        ...this.filter,
        until: next ?? undefined,
      });
    }
  }

  private setFilter(filter: Nostr.Filter) {
    this._filters = [{ ...filter, limit: 0 }];
    this._req$.next({
      subId: this._subId,
      filters: this._filters,
    });
  }
}

export class BackwardReq extends ObservableReqBase implements ObservableReq {
  private _req$: BehaviorSubject<Req>;
  get observable() {
    return this._req$;
  }

  constructor(initial?: Nostr.Filter[]) {
    super({
      subId: uuid(),
      filters: normalizeFilters(initial ?? []),
      strategy: "until-eose",
    });

    this._req$ = new BehaviorSubject({
      subId: this._subId,
      filters: this._filters,
    });
  }

  setFilters(filters: Nostr.Filter[]) {
    this._subId = uuid();
    this._req$.next({
      subId: this._subId,
      filters,
    });
  }
}

function normalizeFilter(filter: Nostr.Filter): Nostr.Filter | null {
  const res: Nostr.Filter = {};
  let isValid = true;
  for (const [key, value] of Object.entries(filter)) {
    if (
      key === "since" ||
      key === "until" ||
      key === "limit" ||
      (value && value.length > 0)
    ) {
      res[key as keyof Nostr.Filter] = value;
    }

    if (value && value.length <= 0) {
      isValid = false;
    }
  }

  return isValid ? res : null;
}

function normalizeFilters(filters: Nostr.Filter[]): Nostr.Filter[] {
  return filters
    .map(normalizeFilter)
    .filter((e): e is Nostr.Filter => e !== null);
}
