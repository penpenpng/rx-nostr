import type * as Nostr from "nostr-typedef";
import { getEventHash, getPublicKey, getSignature, toHex } from "../libs/nostr/crypto.ts";
import type { EventSigner } from "./event-signer.interface.ts";

export class SeckeySigner implements EventSigner {
  #sechex: string;
  #pubhex: string;

  constructor(
    seckey: string,
    private options?: { tags?: Nostr.Tag.Any[] },
  ) {
    this.#sechex = seckey.startsWith("nsec1") ? toHex(seckey) : seckey;
    this.#pubhex = getPublicKey(this.#sechex);
  }

  async signEvent<K extends number>(params: Nostr.EventParameters<K>): Promise<Nostr.Event<K>> {
    const event = {
      ...params,
      pubkey: params.pubkey ?? this.#pubhex,
      tags: [...(params.tags ?? []), ...(this.options?.tags ?? [])],
      created_at: params.created_at ?? Math.floor(Date.now() / 1000),
    };

    if (ensureEventFields(event)) {
      return event;
    }

    const id = event.id ?? getEventHash(event);
    const sig = event.sig ?? getSignature(id, this.#sechex);

    return {
      ...event,
      id,
      sig,
    };
  }

  async getPublicKey() {
    return this.#pubhex;
  }
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
