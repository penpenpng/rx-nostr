import type * as Nostr from "nostr-typedef";
import type { LazyFilter } from "../lazy-filter/index.ts";

export function normalizeFilters(
  filters: LazyFilter | LazyFilter[],
): LazyFilter[] {
  return (Array.isArray(filters) ? filters : [filters])
    .map((filter) => trimInvalidFields(filter))
    .filter((filter): filter is LazyFilter => filter !== null);
}

function trimInvalidFields(filter: LazyFilter): LazyFilter | null {
  const res: LazyFilter = {};
  const isTagName = (s: string): s is Nostr.TagQuery => /^#[a-zA-Z]$/.test(s);

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
