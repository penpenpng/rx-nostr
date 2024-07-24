import * as Nostr from "nostr-typedef";

import { getEventHash, getPublicKey, getSignature, toHex } from "./crypto.js";

export interface EventSigner {
  signEvent<K extends number>(
    params: Nostr.EventParameters<K>,
  ): Promise<Nostr.Event<K>>;
  getPublicKey(): Promise<string>;
}

export interface EventSignerOptions {
  /** If set, the set tags is appended to the end of the given event's tags on signing. */
  tags?: Nostr.Tag.Any[];
}

export function seckeySigner(
  seckey: string,
  options?: EventSignerOptions,
): EventSigner {
  const sechex = seckey.startsWith("nsec1") ? toHex(seckey) : seckey;
  const pubhex = getPublicKey(sechex);

  return {
    async signEvent(params) {
      const event = {
        ...params,
        pubkey: params.pubkey ?? pubhex,
        tags: [...(params.tags ?? []), ...(options?.tags ?? [])],
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
    },
    async getPublicKey() {
      return pubhex;
    },
  };
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
