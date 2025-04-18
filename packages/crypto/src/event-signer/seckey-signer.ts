import type * as Nostr from "nostr-typedef";
import { getEventHash, getPublicKey, getSignature, signEvent, toHex } from "../libs/nostr/crypto.ts";
import { ensureEventFields } from "../libs/nostr/ensure-event-fields.ts";
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
    return signEvent(
      {
        ...params,
        pubkey: params.pubkey ?? this.#pubhex,
        tags: [...(params.tags ?? []), ...(this.options?.tags ?? [])],
        created_at: params.created_at ?? Math.floor(Date.now() / 1000),
      },
      this.#sechex,
    );
  }

  async getPublicKey() {
    return this.#pubhex;
  }
}
