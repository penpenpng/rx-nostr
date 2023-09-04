/** Return a function that is lazily evaluated for since/until parameters of `LazyFilter`. */
import Nostr from "nostr-typedef";

import { LazyFilter } from "./packet.js";

export function now(): number {
  return Math.floor(Date.now() / 1000);
}

export function evalFilters(
  filters: LazyFilter | LazyFilter[]
): Nostr.Filter[] {
  if ("length" in filters) {
    return filters.map(evalFilter);
  } else {
    return [evalFilter(filters)];
  }
}

function evalFilter(filter: LazyFilter): Nostr.Filter {
  return {
    ...filter,
    since: filter.since ? evalLazyNumber(filter.since) : undefined,
    until: filter.until ? evalLazyNumber(filter.until) : undefined,
  };
}

function evalLazyNumber(lazyNumber: number | (() => number)): number {
  return typeof lazyNumber === "number" ? lazyNumber : lazyNumber();
}
