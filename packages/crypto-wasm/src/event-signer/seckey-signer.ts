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
    return signEvent(
      {
        ...params,
        tags: [...(params.tags ?? []), ...(this.options?.tags ?? [])],
      },
      this.#seckey,
    );
  }

  async getPublicKey() {
    return this.#pubhex;
  }
}
