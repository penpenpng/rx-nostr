import { schnorr } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

import { toHex } from "./bech32";
import { Nostr } from "./primitive";

const utf8Encoder = new TextEncoder();

export function getPublicKey(seckey: string): string {
  return bytesToHex(schnorr.getPublicKey(seckey));
}

export function createEventBySecretKey(
  params: Nostr.EventParameters,
  seckey: string
): Nostr.Event {
  const sechex = seckey?.startsWith("nsec1") ? toHex(seckey) : seckey;
  const pubhex = !params.pubkey
    ? getPublicKey(sechex)
    : params.pubkey.startsWith("npub1")
    ? toHex(params.pubkey)
    : params.pubkey;
  const event = {
    ...params,
    tags: params.tags ?? [],
    pubkey: pubhex,
    created_at: params.created_at ?? getCreatedAt(),
  };
  const id = event.id ?? getEventHash(event);
  const sig = event.sig ?? getSignature(id, sechex);
  return {
    ...event,
    id,
    sig,
  };
}

export async function createEventByNip07(
  params: Nostr.EventParameters
): Promise<Nostr.Event> {
  const nostr = (window ?? {})?.nostr;
  if (!nostr) {
    throw new Error("NIP-07 interface is not ready.");
  }

  return nostr.signEvent({
    kind: params.kind,
    tags: params.tags ?? [],
    content: params.content,
    created_at: params.created_at ?? getCreatedAt(),
  });
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

function getCreatedAt() {
  return Math.floor(new Date().getTime() / 1000);
}
