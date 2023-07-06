import { schnorr } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import Nostr from "nostr-typedef";

import { toHex } from "./bech32";

const utf8Encoder = new TextEncoder();

export async function getSignedEvent(
  params: Nostr.EventParameters,
  seckey?: string
): Promise<Nostr.Event> {
  const event = {
    ...params,
    pubkey: params.pubkey ?? (await getPubkey()),
    tags: params.tags ?? [],
    created_at: params.created_at ?? now(),
  };

  if (ensureRequiredFields(params)) {
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

export function getPublicKey(seckey: string): string {
  return bytesToHex(schnorr.getPublicKey(seckey));
}

export function getEventHash(event: Nostr.UnsignedEvent): string {
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);
  return bytesToHex(sha256(utf8Encoder.encode(serialized)));
}

export function getSignature(eventHash: string, seckey: string): string {
  return bytesToHex(schnorr.sign(eventHash, seckey));
}

export function verify(event: Nostr.Event): boolean {
  try {
    return schnorr.verify(event.sig, getEventHash(event), event.pubkey);
  } catch (err) {
    console.warn("The following error occurred during verify():", err);
    return false;
  }
}

export function ensureRequiredFields(
  event: Partial<Nostr.Event>
): event is Nostr.Event {
  if (typeof event.content !== "string") return false;
  if (typeof event.created_at !== "number") return false;
  if (typeof event.pubkey !== "string") return false;
  if (!event.pubkey.match(/^[a-f0-9]{64}$/)) return false;

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

export function now() {
  return Math.floor(new Date().getTime() / 1000);
}

export function earlierEvent(a: Nostr.Event, b: Nostr.Event): Nostr.Event {
  return compareEvents(a, b) < 0 ? a : b;
}

export function laterEvent(a: Nostr.Event, b: Nostr.Event): Nostr.Event {
  return compareEvents(a, b) < 0 ? b : a;
}

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
