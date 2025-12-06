import { schnorr as _schnorr } from "@noble/curves/secp256k1";
import { sha256 as _sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { bech32 } from "@scure/base";
import * as Nostr from "nostr-typedef";
import { ensureEventFields } from "./ensure-event-fields.ts";

const utf8Encoder = new TextEncoder();

export function sha256(m: string): string {
  return bytesToHex(_sha256(utf8Encoder.encode(m)));
}

interface Schnorr {
  sign(m: string, seckey: string): string;
  verify(sig: string, m: string, pubkey: string): boolean;
  getPublicKey(seckey: string): string;
}

const schnorr: Schnorr = {
  sign: (m: string, seckey: string): string =>
    bytesToHex(_schnorr.sign(m, seckey)),
  verify: _schnorr.verify,
  getPublicKey: (seckey: string) => bytesToHex(_schnorr.getPublicKey(seckey)),
};

export function signEvent<K extends number>(
  params: Nostr.EventParameters<K>,
  seckey: string,
): Nostr.Event<K> {
  const sechex = seckey.startsWith("nsec1") ? toHex(seckey) : seckey;

  const event = {
    ...params,
    pubkey: params.pubkey ?? getPublicKey(sechex),
    tags: params.tags ?? [],
    created_at: params.created_at ?? Math.floor(Date.now() / 1000),
  };

  if (ensureEventFields(event)) {
    return event;
  }

  const id = event.id ?? getEventHash(event);
  const sig = event.sig ?? getSignature(id, sechex);

  return {
    ...event,
    id,
    sig,
  };
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
export function verifyEvent(event: Nostr.Event): boolean {
  try {
    return schnorr.verify(event.sig, getEventHash(event), event.pubkey);
  } catch {
    return false;
  }
}

/** Convert bech32 format string to HEX format string. */
export function toHex(str: string): string {
  const { words } = bech32.decode(str as `${string}1${string}`);
  const data = new Uint8Array(bech32.fromWords(words));
  return bytesToHex(data);
}
