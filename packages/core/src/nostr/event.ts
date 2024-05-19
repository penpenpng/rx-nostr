import * as Nostr from "nostr-typedef";

import { toHex } from "./bech32.js";
import { schnorr, sha256 } from "./hash.js";

/**
 * Return a signed event that is ready for sending.
 */
export async function getSignedEvent(
  params: Nostr.EventParameters,
  /** Private key in bech32 format of HEX format. If omitted, attempt to use NIP-07 interface. */
  seckey?: string
): Promise<Nostr.Event> {
  const event = {
    ...params,
    pubkey: params.pubkey ?? (await getPubkey()),
    tags: params.tags ?? [],
    created_at: params.created_at ?? Math.floor(Date.now() / 1000),
  };

  if (ensureEventFields(params)) {
    return params;
  } else if (seckey) {
    const id = event.id ?? getEventHash(event);
    const sechex = seckey.startsWith("nsec1") ? toHex(seckey) : seckey;
    return {
      ...event,
      id,
      sig: event.sig ?? getSignature(id, sechex),
    };
  } else {
    const nostr = (window ?? {})?.nostr;
    if (!nostr) {
      throw new Error(
        "Couldn't get sig. To automatically calculate signature, a seckey argument or NIP-07 environment is required."
      );
    }

    return nostr.signEvent({
      kind: event.kind,
      tags: event.tags,
      content: event.content,
      created_at: event.created_at,
    });
  }

  async function getPubkey() {
    if (params.pubkey) {
      if (params.pubkey.startsWith("npub1")) {
        return toHex(params.pubkey);
      } else {
        return params.pubkey;
      }
    } else {
      if (seckey) {
        if (seckey.startsWith("nsec1")) {
          return getPublicKey(toHex(seckey));
        } else {
          return getPublicKey(seckey);
        }
      } else {
        const pubkey = await window?.nostr?.getPublicKey();
        if (!pubkey) {
          throw new Error(
            "Couldn't get pubkey. To automatically calculate pubkey, a seckey argument or NIP-07 environment is required."
          );
        }
        return pubkey;
      }
    }
  }
}

/** Calculate and return public key in HEX format. */
export function getPublicKey(seckey: string): string {
  return schnorr.getPublicKey(seckey);
}

/** Calculate and return event's hash (ID). */
export function getEventHash(event: Nostr.UnsignedEvent): string {
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);
  return sha256(serialized);
}

/** Calculate and return schnorr signature. */
export function getSignature(eventHash: string, seckey: string): string {
  return schnorr.sign(eventHash, seckey);
}

/** Verify the given event and return true if it is valid. */
export function verify(event: Nostr.Event): boolean {
  try {
    return schnorr.verify(event.sig, getEventHash(event), event.pubkey);
  } catch (err) {
    console.warn("The following error occurred during verify():", err);
    return false;
  }
}

export function ensureEventFields(
  event: Partial<Nostr.Event>
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
