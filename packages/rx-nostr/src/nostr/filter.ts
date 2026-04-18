import * as Nostr from "nostr-typedef";

import { fill } from "../utils/config.js";

export interface MatchFilterOptions {
  sinceInclusive: boolean;
  untilInclusive: boolean;
}

/**
 * Return true if the given filter matches the given filters.
 */
export function isFiltered(
  event: Nostr.Event,
  filters: Nostr.Filter | Nostr.Filter[],
  options?: Partial<MatchFilterOptions>,
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
  options?: Partial<MatchFilterOptions>,
): boolean {
  const { sinceInclusive, untilInclusive } = fill(options ?? {}, {
    sinceInclusive: true,
    untilInclusive: true,
  });

  if (
    filter.ids &&
    filter.ids.every((prefix) => !event.id.startsWith(prefix))
  ) {
    return false;
  }
  if (filter.kinds && !filter.kinds.includes(event.kind)) {
    return false;
  }
  if (
    filter.authors &&
    filter.authors.every((pubkey) => !event.pubkey.startsWith(pubkey))
  ) {
    return false;
  }
  if (
    filter.since &&
    ((sinceInclusive && !(filter.since <= event.created_at)) ||
      (!sinceInclusive && !(filter.since < event.created_at)))
  ) {
    return false;
  }
  if (
    filter.until &&
    ((untilInclusive && !(event.created_at <= filter.until)) ||
      (!untilInclusive && !(event.created_at < filter.until)))
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
        ([tagName, tagValue]) =>
          needleTagName === tagName &&
          (needleValues as string[]).includes(tagValue),
      )
    ) {
      return false;
    }
  }

  return true;
}
