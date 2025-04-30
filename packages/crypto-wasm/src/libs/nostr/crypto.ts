import {
  Event,
  EventBuilder,
  Keys,
  Kind,
  loadWasmSync,
  Tag,
  Timestamp,
} from "@rust-nostr/nostr-sdk";
import type * as Nostr from "nostr-typedef";
import { ensureEventFields } from "./ensure-event-fields.ts";

loadWasmSync();

export function signEvent<K extends number>(
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

  const event = new EventBuilder(new Kind(kind), content)
    .tags((tags ?? []).map((tag) => Tag.parse(tag)))
    .customCreatedAt(Timestamp.fromSecs(created_at));

  const signedEvent: Nostr.Event<K> = JSON.parse(
    event.signWithKeys(Keys.parse(seckey)).asJson(),
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

export function verifyEvent(event: Nostr.Event): boolean {
  try {
    return Event.fromJson(JSON.stringify(event)).verify();
  } catch {
    return false;
  }
}

export function getPublicKey(seckey: string): string {
  return Keys.parse(seckey).publicKey.toHex();
}

export function generateKeyPair() {
  const keys = Keys.generate();

  return {
    seckey: keys.secretKey.toHex(),
    pubkey: keys.publicKey.toHex(),
  };
}
