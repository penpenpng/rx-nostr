import type * as Nostr from "nostr-typedef";

export function ensureEventFields(
  event: Partial<Nostr.Event>,
): event is Nostr.Event {
  if (typeof event.id !== "string") return false;
  if (typeof event.sig !== "string") return false;
  if (typeof event.kind !== "number") return false;
  if (typeof event.pubkey !== "string") return false;
  if (typeof event.content !== "string") return false;
  if (typeof event.created_at !== "number") return false;

  if (!Array.isArray(event.tags)) return false;
  for (let i = 0; i < event.tags.length; i++) {
    const tag = event.tags[i];
    if (!Array.isArray(tag)) return false;
    for (let j = 0; j < tag.length; j++) {
      if (typeof tag[j] === "object") return false;
    }
  }

  return true;
}

/** Return an event that has earlier `created_at`. */
export function earlierEvent(a: Nostr.Event, b: Nostr.Event): Nostr.Event {
  return compareEvents(a, b) < 0 ? a : b;
}

/** Return an event that has later `created_at`. */
export function laterEvent(a: Nostr.Event, b: Nostr.Event): Nostr.Event {
  return compareEvents(a, b) < 0 ? b : a;
}

/** Sort key function to sort events based on `created_at`. */
export function compareEvents(a: Nostr.Event, b: Nostr.Event): number {
  if (a.id === b.id) {
    return 0;
  }

  return a.created_at < b.created_at ||
    // https://github.com/nostr-protocol/nips/blob/master/16.md#replaceable-events
    (a.created_at === b.created_at && a.id < b.id)
    ? -1
    : 1;
}
