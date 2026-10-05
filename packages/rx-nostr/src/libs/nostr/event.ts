import type * as Nostr from "nostr-typedef";

export function ensureEventFields(event: Partial<Nostr.Event>): event is Nostr.Event {
  if (typeof event.id !== "string") {
    return false;
  }
  if (typeof event.sig !== "string") {
    return false;
  }
  if (typeof event.kind !== "number") {
    return false;
  }
  if (typeof event.pubkey !== "string") {
    return false;
  }
  if (typeof event.content !== "string") {
    return false;
  }
  if (typeof event.created_at !== "number") {
    return false;
  }

  if (!Array.isArray(event.tags)) {
    return false;
  }

  for (let i = 0; i < event.tags.length; i++) {
    const tag = event.tags[i];

    if (!Array.isArray(tag)) {
      return false;
    }

    for (let j = 0; j < tag.length; j++) {
      if (typeof tag[j] === "object") {
        return false;
      }
    }
  }

  return true;
}

/** Return the older event; a larger ID loses a same-timestamp tie. */
export function earlierEvent(a: Nostr.Event, b: Nostr.Event): Nostr.Event {
  return compareEvents(a, b) < 0 ? a : b;
}

/** Return the newer event; a smaller ID wins a same-timestamp tie. */
export function laterEvent(a: Nostr.Event, b: Nostr.Event): Nostr.Event {
  return compareEvents(a, b) < 0 ? b : a;
}

/** Ascending order: older timestamps first, then larger IDs first. */
export function compareEvents(a: Nostr.Event, b: Nostr.Event): number {
  if (a.id === b.id) {
    return 0;
  }

  return a.created_at < b.created_at ||
    // NIP-01 retains the lexically smallest ID for replaceable timestamp ties.
    (a.created_at === b.created_at && a.id > b.id)
    ? -1
    : 1;
}
