import type * as Nostr from "nostr-typedef";

export function isExpired(event: Nostr.Event, now?: number): boolean {
  const tag = event.tags.find((tag) => tag[0] === "expiration");

  if (!tag) {
    return false;
  }

  try {
    const timestamp = Number(tag[1]);

    if (!Number.isInteger(timestamp)) {
      return false;
    }

    return timestamp <= (now ?? Math.floor(Date.now() / 1000));
  } catch {
    return false;
  }
}
