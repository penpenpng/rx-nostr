import { schnorr as _schnorr } from "@noble/curves/secp256k1";
import { sha256 as _sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import {
  Event,
  EventBuilder,
  Keys,
  loadWasmSync,
  Tag,
  Timestamp,
} from "@rust-nostr/nostr";
import { bech32 } from "@scure/base";
import * as Nostr from "nostr-typedef";

loadWasmSync();

const utf8Encoder = new TextEncoder();

export function sha256(m: string): string {
  return bytesToHex(_sha256(utf8Encoder.encode(m)));
}

/** @deprecated */
export interface Schnorr {
  sign(m: string, seckey: string): string;
  verify(sig: string, m: string, pubkey: string): boolean;
  getPublicKey(seckey: string): string;
}

/** @deprecated */
export const schnorr: Schnorr = {
  sign: (m: string, seckey: string): string =>
    bytesToHex(_schnorr.sign(m, seckey)),
  verify: _schnorr.verify,
  getPublicKey: (seckey: string) => Keys.parse(seckey).publicKey.toHex(),
};

export function generateKeyPair() {
  const keys = Keys.generate();

  return {
    seckey: keys.secretKey.toHex(),
    pubkey: keys.publicKey.toHex(),
  };
}

export function signEventBySeckey<K extends number>(
  params: Nostr.EventParameters<K>,
  seckey: string,
): Nostr.Event<K> {
  const filledParams = {
    ...params,
    tags: params.tags ?? [],
    created_at: params.created_at ?? Math.floor(Date.now() / 1000),
  };
  if (ensureEventFields(filledParams)) {
    return filledParams;
  }

  const { kind, content, tags, created_at, pubkey, id, sig } = filledParams;

  const event = new EventBuilder(
    kind,
    content,
    (tags ?? []).map((tag) => Tag.parse(tag)),
  ).customCreatedAt(Timestamp.fromSecs(created_at));

  const signedEvent: Nostr.Event<K> = JSON.parse(
    event.toEvent(Keys.parse(seckey)).asJson(),
  );

  if (id) {
    signedEvent.id = id;
  }
  if (pubkey) {
    signedEvent.pubkey = pubkey;
  }
  if (sig) {
    signedEvent.sig = sig;
  }

  return signedEvent;
}

/** @internal Unstable API */
export function toHexSeckey(seckey: string) {
  return Keys.parse(seckey).secretKey.toHex();
}

/** Calculate and return public key in HEX format. */
export function getPublicKey(seckey: string): string {
  return Keys.parse(seckey).publicKey.toHex();
}

/** @deprecated Calculate and return event's hash (ID). */
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

/** @deprecated Calculate and return schnorr signature. */
export function getSignature(eventHash: string, seckey: string): string {
  return schnorr.sign(eventHash, seckey);
}

/** Verify the given event and return true if it is valid. */
export function verify(event: Nostr.Event): boolean {
  try {
    return Event.fromJson(JSON.stringify(event)).verify();
  } catch (err) {
    console.warn("The following error occurred during verify():", err);
    return false;
  }
}

/** Convert bech32 format string to HEX format string. */
export function toHex(str: string): string {
  const { words } = bech32.decode(str);
  const data = new Uint8Array(bech32.fromWords(words));
  return bytesToHex(data);
}

function ensureEventFields(event: Partial<Nostr.Event>): event is Nostr.Event {
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
