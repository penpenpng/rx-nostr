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
    value.created_at >= 0 &&
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
