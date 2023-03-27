import {
  BehaviorSubject,
  debounce,
  filter,
  identity,
  interval,
  map,
  Observable,
} from "rxjs";

import { Nostr } from "./nostr/primitive";

export interface Req {
  subId: string;
  filters: Observable<Nostr.Filter[]> | Nostr.Filter[];
}

interface MonoFilterReqOptions {
  initialFilter?: Nostr.Filter;
  debounce?: number | null;
  windowSize?: number;
}

export class MonoFilterReq implements Req {
  get subId() {
    return this._subId;
  }
  private set subId(v: string) {
    this._subId = v;
  }
  private _subId: string;

  get filters() {
    const debounceTime = this.options.debounce;

    return this.subject.pipe(
      filter((filter) =>
        Object.values(filter).some((queries) => queries && queries.length > 0)
      ),
      map((filter) => [filter]),
      debounceTime ? debounce(() => interval(debounceTime)) : identity
    );
  }
  private subject: BehaviorSubject<Nostr.Filter>;
  private filter: Nostr.Filter;

  private options: Required<MonoFilterReqOptions>;

  constructor(subId: string, options?: MonoFilterReqOptions) {
    this._subId = subId;
    this.filter = options?.initialFilter ?? {};
    this.subject = new BehaviorSubject(this.filter);
    this.options = {
      debounce: options?.debounce ?? null,
      windowSize: options?.windowSize ?? 0,
      initialFilter: options?.initialFilter ?? {},
    };
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
      this.next({
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
      this.next({
        ...this.filter,
        [target]: next.length > 0 ? next : undefined,
      });
    }
  }

  clear(target: "kinds" | "ids" | "authors" | Nostr.TagName) {
    const prev = this.filter[target] ?? [];

    if (prev.length > 0) {
      this.next({
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
      this.next({
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
      this.next({
        ...this.filter,
        until: next ?? undefined,
      });
    }
  }

  private next(filter: Nostr.Filter) {
    this.subject.next({
      ...filter,
      limit: this.options.windowSize,
    });
    this.filter = filter;
  }
}
