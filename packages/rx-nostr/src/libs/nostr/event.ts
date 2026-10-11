import type * as Nostr from "nostr-typedef";

/** Check EVENT field types and basic NIP-01 ranges, without verifying ID or signature. */
export function ensureEventFields(event: unknown): event is Nostr.Event {
  if (typeof event !== "object" || event === null || Array.isArray(event)) {
    return false;
  }

  const value = event as Record<string, unknown>;

  return (
    typeof value.id === "string" &&
    typeof value.sig === "string" &&
    typeof value.pubkey === "string" &&
    typeof value.content === "string" &&
    typeof value.created_at === "number" &&
    Number.isSafeInteger(value.created_at) &&
    typeof value.kind === "number" &&
    Number.isInteger(value.kind) &&
    value.kind >= 0 &&
    value.kind <= 65_535 &&
    Array.isArray(value.tags) &&
    value.tags.every(
      (tag: unknown) =>
        Array.isArray(tag) && tag.length > 0 && tag.every((item) => typeof item === "string"),
    )
  );
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
