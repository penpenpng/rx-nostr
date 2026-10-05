import type * as Nostr from "nostr-typedef";

import type { LazyFilter } from "./lazy-filter.interface.ts";

const isTagName = (value: string): value is Nostr.TagQuery => /^#[a-zA-Z]$/.test(value);
const isTime = (value: unknown): value is number | (() => number) =>
  typeof value === "function" ||
  (typeof value === "number" && Number.isInteger(value) && value >= 0);
const isStringList = (value: unknown, allowEmptyValue: boolean): value is string[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((item) => typeof item === "string" && (allowEmptyValue || item.length > 0));
const isKindList = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((item) => typeof item === "number" && Number.isInteger(item) && item >= 0);

/**
 * Keep only satisfiable REQ branches. An empty list of branches or an empty
 * condition list matches nothing; only an explicit `{}` means match all.
 * Lazy bounds remain functions until the send attempt evaluates them.
 */
export function normalizeFilters(filters: LazyFilter | readonly LazyFilter[]): LazyFilter[] {
  const branches = Array.isArray(filters) ? filters : [filters];

  return branches.flatMap((branch) => {
    const normalized = normalizeFilter(branch);

    return normalized === null ? [] : [normalized];
  });
}

function normalizeFilter(filter: LazyFilter): LazyFilter | null {
  if (typeof filter !== "object" || filter === null || Array.isArray(filter)) {
    return null;
  }

  const result: LazyFilter = {};

  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined) {
      continue;
    }

    if (key === "ids" || key === "authors" || isTagName(key)) {
      if (!isStringList(value, isTagName(key))) {
        return null;
      }

      result[key] = [...value];

      continue;
    }

    if (key === "kinds") {
      if (!isKindList(value)) {
        return null;
      }

      result.kinds = [...value];

      continue;
    }

    if (key === "since" || key === "until") {
      if (!isTime(value)) {
        return null;
      }

      result[key] = value;

      continue;
    }

    if (key === "limit") {
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
        return null;
      }

      result.limit = value;

      continue;
    }

    if (key === "search" && typeof value === "string") {
      result.search = value;

      continue;
    }

    return null;
  }

  if (
    typeof result.since === "number" &&
    typeof result.until === "number" &&
    result.since > result.until
  ) {
    return null;
  }

  return result;
}
