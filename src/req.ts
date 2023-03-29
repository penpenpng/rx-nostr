import {
  BehaviorSubject,
  identity,
  MonoTypeOperatorFunction,
  Observable,
  of,
  tap,
} from "rxjs";
import { v4 as uuid } from "uuid";

import { Nostr } from "./nostr/primitive";
import { MonoFilterAccumulater, normalizeFilters } from "./filter";

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

  connect(
    acc: MonoFilterAccumulater,
    preprocess?: MonoTypeOperatorFunction<Nostr.Filter>
  ) {
    this.setFilters([acc.getFilter()]);
    acc
      .observe()
      .pipe(preprocess ?? identity)
      .subscribe((filter) => {
        this.setFilters([filter]);
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

  connect(
    acc: MonoFilterAccumulater,
    preprocess?: MonoTypeOperatorFunction<Nostr.Filter>
  ) {
    this.setFilters([acc.getFilter()]);
    acc
      .observe()
      .pipe(
        preprocess ?? identity,
        tap(() => {
          // Each req in BackwardReq stream should be "prime" to each other
          acc.flush();
        })
      )
      .subscribe((filter) => {
        this.setFilters([filter]);
      });
  }
}
