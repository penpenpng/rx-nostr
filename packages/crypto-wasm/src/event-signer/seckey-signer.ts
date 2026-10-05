import type * as Nostr from "nostr-typedef";

import { getPublicKey, signEvent } from "../libs/nostr/crypto.ts";
import type { EventSigner } from "./event-signer.interface.ts";

export class SeckeySigner implements EventSigner {
  #seckey: string;
  #pubhex: string;

  constructor(
    seckey: string,
    private options?: { tags?: Nostr.Tag.Any[] },
  ) {
    this.#seckey = seckey;
    this.#pubhex = getPublicKey(seckey);
  }

  async signEvent<K extends number>(params: Nostr.EventParameters<K>): Promise<Nostr.Event<K>> {
    const appendTags = (this.options?.tags?.length ?? 0) > 0;

    return signEvent(
      {
        ...params,
        ...(appendTags ? { id: undefined, sig: undefined } : {}),
        pubkey: appendTags ? this.#pubhex : (params.pubkey ?? this.#pubhex),
        tags: [...(params.tags ?? []), ...(this.options?.tags ?? [])],
        created_at: params.created_at ?? Math.floor(Date.now() / 1000),
      },
      this.#seckey,
    );
  }

  async getPublicKey() {
    return this.#pubhex;
  }
}
