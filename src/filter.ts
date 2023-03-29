import { BehaviorSubject, Observable, Subject } from "rxjs";
import { Nostr } from "./nostr/primitive";

export class MonoFilterAccumulater {
  private filter: Nostr.Filter;
  private filter$: BehaviorSubject<Nostr.Filter>;

  constructor(initial?: Nostr.Filter) {
    this.filter = normalizeFilter(initial ?? {});
    this.filter$ = new BehaviorSubject(this.filter);
  }

  getFilter() {
    return this.filter;
  }
  setFilter(filter: Nostr.Filter) {
    this.next(normalizeFilter(filter));
  }
  observe(): Observable<Nostr.Filter> {
    return this.filter$;
  }
  flush() {
    // Clears filters but does not send a notification.
    this.filter = {};
  }

  private next(filter: Nostr.Filter) {
    this.filter = filter;
    this.filter$.next(filter);
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
  setLimit(limit: number | null): void {
    const prev = this.filter.limit ?? null;
    const next = limit;

    if (prev !== next) {
      this.next({
        ...this.filter,
        limit: next ?? undefined,
      });
    }
  }
}

export function normalizeFilter(filter: Nostr.Filter): Nostr.Filter {
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
    return {};
  }

  if (Object.keys(res).length <= 0) {
    return {};
  }

  return res;
}

export function normalizeFilters(filters: Nostr.Filter[]): Nostr.Filter[] {
  return filters
    .map(normalizeFilter)
    .filter((filter) => Object.keys(filter).length > 0);
}
