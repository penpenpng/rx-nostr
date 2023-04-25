import {
  BehaviorSubject,
  debounceTime,
  filter,
  generate,
  identity,
  map,
  mergeAll,
  MonoTypeOperatorFunction,
  Observable,
  ObservableInput,
  of,
  OperatorFunction,
  pipe,
  repeat,
  tap,
  zipWith,
} from "rxjs";
import { v4 as uuid } from "uuid";

import { Nostr } from "./nostr/primitive";
import { EventMessageNotification } from "./type";
import { extractEvent } from "./util";

type ReqStrategy =
  | {
      kind: "backward";
      // config?: {
      //   // closeOnEOSE: true;
      //   timeout?: number;
      //   // joinBy: "merge";
      //   reducer?: <T>() => MonoTypeOperatorFunction<T>;
      // };
    }
  | {
      kind: "forward";
      // config?: {
      //   // closeOnEOSE: false;
      //   // joinBy: "switch";
      //   reducer?: <T>() => MonoTypeOperatorFunction<T>;
      // };
    };
type ReqStrategyConfig<K extends ReqStrategy["kind"]> = (ReqStrategy & {
  kind: K;
})["config"];

function toREQ(
  strategy: ReqStrategy
): OperatorFunction<Nostr.Filter[], Nostr.OutgoingMessage.REQ> {
  if (strategy.kind === "backward") {
    const subId = uuid();
    return pipe(
      filter((filters) => filters.length > 0),
      map((filters): Nostr.OutgoingMessage.REQ => ["REQ", subId, ...filters])
    );
  } else {
    return pipe(
      filter((filters) => filters.length > 0),
      map((filters): Nostr.OutgoingMessage.REQ => ["REQ", uuid(), ...filters])
    );
  }
}

export interface ReqQuery {
  readonly subId: string;
  readonly filters: Nostr.Filter[];
}

export interface ReqBehavior {
  /** @internal */
  observe: () => Observable<Nostr.OutgoingMessage.REQ>;
  /** @internal */
  consume: () => void;
  /** @internal */
  readonly strategy: ReqStrategy;
}
// もう REQ, consume(), strategy の observable にすればよくない？ ← 却下

export interface ReqUpdater {
  next(filters: Nostr.Filter[]): void;
}

class ReqBase {
  protected constructor(protected _strategy: ReqStrategy) {}
  get strategy() {
    return this._strategy;
  }

  protected filters$ = new BehaviorSubject<Nostr.Filter[]>([]);

  consume() {
    /* Do nothing */
  }

  observe() {
    return this.filters$.pipe(
      this._strategy?.config?.reducer?.() ?? identity,
      toREQ(this.strategy)
    );
  }

  protected next(filters: Nostr.Filter[]) {
    this.filters$.next(normalizeFilters(filters));
  }
}

export class Req extends ReqBase {
  static backward(
    options?: ReqStrategyConfig<"backward">
  ): [ReqBehavior, ReqUpdater] {
    const q = new this({
      kind: "backward",
      ...options,
    });

    return [q, q];
  }

  static forward(
    options?: ReqStrategyConfig<"forward">
  ): [ReqBehavior, ReqUpdater] {
    const q = new this({
      kind: "forward",
      ...options,
    });

    return [q, q];
  }

  next(filters: Nostr.Filter[]) {
    super.next(filters);
  }
}

class AccumulativeReqBase extends ReqBase implements ReqBehavior {
  protected constructor(baseFilter: Nostr.Filter, _strategy: ReqStrategy) {
    super(_strategy);
    this.acc = new MonoFilterAccumulater(baseFilter);
  }

  protected acc: MonoFilterAccumulater;

  consume() {
    if (this.strategy.kind === "backward") {
      this.acc.reset();
    }
  }

  observe() {
    return this.acc.filter$.pipe(
      map((filter) => [filter]),
      this._strategy?.config?.reducer ?? identity,
      toREQ(this.strategy)
    );
  }
}

export class AccumulativeReq
  extends AccumulativeReqBase
  implements ReqBehavior
{
  static backward(
    baseFilter: Nostr.Filter,
    options?: ReqStrategyConfig<"backward">
  ): [ReqBehavior, IMonoFilterAccumulater] {
    const q = new this(baseFilter, {
      kind: "backward",
      ...options,
    });

    return [q, q.acc];
  }

  static forward(
    baseFilter: Nostr.Filter,
    options?: ReqStrategyConfig<"forward">
  ): [ReqBehavior, IMonoFilterAccumulater] {
    const q = new this(baseFilter, {
      kind: "forward",
      ...options,
    });

    return [q, q.acc];
  }
}

export class EventReq extends AccumulativeReqBase {
  static backward(options?: ReqStrategyConfig<"backward">) {
    return new this(
      {},
      {
        kind: "backward",
        ...options,
      }
    );
  }

  add(...ids: string[]) {
    this.acc.add("ids", ...ids);
    this.acc.commit();
  }

  collectTags() {
    return tap<EventMessageNotification>((event) => {
      const { tags } = extractEvent(event);
      const vals = tags.filter(([t]) => t === "e").map(([, val]) => val);

      if (vals.length <= 0) {
        return;
      }

      this.add(...vals);
    });
  }
}

export class UserReq extends AccumulativeReqBase {
  static backward(
    target: {
      profile?: true;
      follows?: true;
      follower?: true;
    },
    options?: ReqStrategyConfig<"backward">
  ) {
    // TODO:

    return new this(
      {},
      {
        kind: "backward",
        ...options,
      }
    );
  }
}

export interface IMonoFilterAccumulater {
  add(target: "kinds", ...queries: number[]): void;
  add(target: "ids" | "authors" | Nostr.TagName, ...queries: string[]): void;
  add(
    target: "kinds" | "ids" | "authors" | Nostr.TagName,
    ...queries: string[] | number[]
  ): void;

  remove(target: "kinds", ...queries: number[]): void;
  remove(target: "ids" | "authors" | Nostr.TagName, ...queries: string[]): void;
  remove(
    target: "kinds" | "ids" | "authors" | Nostr.TagName,
    ...queries: string[] | number[]
  ): void;

  clear(target: "kinds" | "ids" | "authors" | Nostr.TagName): void;

  setSince(datetime: number | Date | null): void;
  setUntil(datetime: number | Date | null): void;
  setLimit(limit: number | null): void;

  commit(): void;
}

class MonoFilterAccumulater implements IMonoFilterAccumulater {
  private filter: Nostr.Filter;
  /** @internal */
  filter$: BehaviorSubject<Nostr.Filter>;

  constructor(private baseFilter: Nostr.Filter) {
    this.filter = baseFilter;
    this.filter$ = new BehaviorSubject(baseFilter);
  }

  commit() {
    if (validateFilter(this.filter)) {
      this.filter$.next(this.filter);
    }
  }

  add(target: "kinds", ...queries: number[]): void;
  add(target: "ids" | "authors" | Nostr.TagName, ...queries: string[]): void;
  add(
    target: "kinds" | "ids" | "authors" | Nostr.TagName,
    ...queries: string[] | number[]
  ): void {
    const prev = this.filter[target] ?? [];
    const next = Array.from(new Set([...prev, ...queries]));

    if (prev.length !== next.length) {
      this.filter = {
        ...this.filter,
        [target]: next.length > 0 ? next : undefined,
      };
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
      this.filter = {
        ...this.filter,
        [target]: next.length > 0 ? next : undefined,
      };
    }
  }

  clear(target: "kinds" | "ids" | "authors" | Nostr.TagName) {
    const prev = this.filter[target] ?? [];

    if (prev.length > 0) {
      this.filter = {
        ...this.filter,
        [target]: undefined,
      };
    }
  }

  setSince(datetime: number | Date | null): void {
    const prev = this.filter.since ?? null;
    const next =
      typeof datetime === "number" || datetime === null
        ? datetime
        : Math.floor(datetime.getTime() / 1000);

    if (prev !== next) {
      this.filter = {
        ...this.filter,
        since: next ?? undefined,
      };
    }
  }
  setUntil(datetime: number | Date | null): void {
    const prev = this.filter.until ?? null;
    const next =
      typeof datetime === "number" || datetime === null
        ? datetime
        : Math.floor(datetime.getTime() / 1000);

    if (prev !== next) {
      this.filter = {
        ...this.filter,
        until: next ?? undefined,
      };
    }
  }
  setLimit(limit: number | null): void {
    const prev = this.filter.limit ?? null;
    const next = limit;

    if (prev !== next) {
      this.filter = {
        ...this.filter,
        limit: next ?? undefined,
      };
    }
  }

  /** @internal */
  reset() {
    // Clears filters but does not send a notification.
    this.filter = this.baseFilter;
  }
}

function normalizeFilter(filter: Nostr.Filter): Nostr.Filter {
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

function validateFilter(filter: Nostr.Filter): boolean {
  return Object.keys(normalizeFilter(filter)).length > 0;
}

function normalizeFilters(filters: Nostr.Filter[]): Nostr.Filter[] {
  return filters.map(normalizeFilter).filter(validateFilter);
}
