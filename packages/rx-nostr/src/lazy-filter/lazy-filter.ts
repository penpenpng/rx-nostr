import * as Nostr from "nostr-typedef";

import type { LazyFilter } from "./lazy-filter.interface.ts";

/**
 * Evaluate lazy bounds for one REQ send attempt, including reconnect resends.
 * Structural validation of the evaluated filters belongs to the caller.
 */
export function evalFilters(filters: LazyFilter | LazyFilter[]): Nostr.Filter[] {
  if ("length" in filters) {
    return filters.map(evalFilter);
  } else {
    return [evalFilter(filters)];
  }
}

function evalFilter(filter: LazyFilter): Nostr.Filter {
  return {
    ...filter,
    since: filter.since === undefined ? undefined : evalLazyNumber(filter.since),
    until: filter.until === undefined ? undefined : evalLazyNumber(filter.until),
  };
}

function evalLazyNumber(lazyNumber: number | (() => number)): number {
  return typeof lazyNumber === "number" ? lazyNumber : lazyNumber();
}
