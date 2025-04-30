import { filter, type MonoTypeOperatorFunction } from "rxjs";
import { evalFilters, type LazyFilter } from "../../lazy-filter/index.ts";
import {
  isFiltered,
  type MatchFilterOptions,
} from "../../libs/nostr/filter.ts";
import { xor } from "../../libs/xor.ts";
import type { EventPacket } from "../../packets/index.ts";

/**
 * Filter events based on a REQ filter object.
 */
export function filterBy<P extends EventPacket>(
  filters: LazyFilter | LazyFilter[],
  options?: MatchFilterOptions & { not?: boolean },
): MonoTypeOperatorFunction<P> {
  const evaledFilter = evalFilters(filters);
  return filter(({ event }) => {
    return xor(isFiltered(event, evaledFilter, options), options?.not ?? false);
  });
}
