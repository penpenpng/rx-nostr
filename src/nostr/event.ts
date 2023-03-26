import * as secp256k1 from "@noble/secp256k1";
import { sha256 } from "@noble/hashes/sha256";

import { Nostr } from "./primitive";

const utf8Encoder = new TextEncoder();
secp256k1.utils.sha256Sync = (...msgs) =>
  sha256(secp256k1.utils.concatBytes(...msgs));

export function createEventBySecretKey(
  params: Nostr.EventParameters,
  seckey: string
): Nostr.Event {
  const unsignedEvent: Nostr.UnsignedEvent = {
    created_at: Math.floor(new Date().getTime() / 1000),
    ...params,
  };
  return sign(unsignedEvent, seckey);
}

export function createEventByNip07(
  params: Nostr.EventParameters
): Promise<Nostr.Event> {
  const nostr = window?.nostr;
  if (!nostr) {
    throw new Error("NIP-07 interface is not ready.");
  }

  const unsignedEvent: Nostr.UnsignedEvent = {
    created_at: Math.floor(new Date().getTime() / 1000),
    ...params,
  };
  return nostr.signEvent(unsignedEvent);
}

export function getEventHash({
  pubkey,
  created_at,
  kind,
  tags,
  content,
}: Nostr.UnsignedEvent): string {
  return secp256k1.utils.bytesToHex(
    sha256(
      utf8Encoder.encode(
        JSON.stringify([0, pubkey, created_at, kind, tags, content])
      )
    )
  );
}

export function sign(event: Nostr.UnsignedEvent, key: string): Nostr.Event {
  const id = getEventHash(event);
  const sig = secp256k1.utils.bytesToHex(secp256k1.schnorr.signSync(id, key));

  return {
    id,
    sig,
    ...event,
  };
}

export function verify(event: Nostr.Event): boolean {
  return (
    ensureRequiredFields(event) &&
    secp256k1.schnorr.verifySync(event.sig, getEventHash(event), event.pubkey)
  );
}

export function ensureRequiredFields(event: Nostr.Event): boolean {
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
