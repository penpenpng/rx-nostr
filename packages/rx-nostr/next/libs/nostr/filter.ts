import type * as Nostr from "nostr-typedef";

export interface MatchFilterOptions {
  sinceExclusive?: boolean;
  untilExclusive?: boolean;
}

/**
 * Return true if the given filter matches the given filters.
 */
export function isFiltered(
  event: Nostr.Event,
  filters: Nostr.Filter | Nostr.Filter[],
  options?: {
    sinceExclusive?: boolean;
    untilExclusive?: boolean;
  },
): boolean {
  if (Array.isArray(filters)) {
    return filters.some((filter) => _isFiltered(event, filter, options));
  } else {
    return _isFiltered(event, filters, options);
  }
}

function _isFiltered(
  event: Nostr.Event,
  filter: Nostr.Filter,
  options?: {
    sinceExclusive?: boolean;
    untilExclusive?: boolean;
  },
): boolean {
  const sinceExclusive = options?.sinceExclusive ?? false;
  const untilExclusive = options?.untilExclusive ?? false;

  if (filter.ids && filter.ids.every((prefix) => !event.id.startsWith(prefix))) {
    return false;
  }
  if (filter.kinds && !filter.kinds.includes(event.kind)) {
    return false;
  }
  if (filter.authors && filter.authors.every((pubkey) => !event.pubkey.startsWith(pubkey))) {
    return false;
  }
  if (
    filter.since &&
    ((sinceExclusive && !(filter.since < event.created_at)) || (!sinceExclusive && !(filter.since <= event.created_at)))
  ) {
    return false;
  }
  if (
    filter.until &&
    ((untilExclusive && !(event.created_at < filter.until)) || (!untilExclusive && !(event.created_at <= filter.until)))
  ) {
    return false;
  }

  for (const [key, needleValues] of Object.entries(filter)) {
    if (!key.startsWith("#") || !Array.isArray(needleValues)) {
      continue;
    }
    const needleTagName = key.slice(1);

    if (
      !event.tags.find(
        ([tagName, tagValue]) => needleTagName === tagName && (needleValues as string[]).includes(tagValue),
      )
    ) {
      return false;
    }
  }

  return true;
}
