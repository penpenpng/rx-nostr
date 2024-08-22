import * as Nostr from "nostr-typedef";

import { getPublicKey, signEventBySeckey } from "./crypto.js";

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
  const pubhex = getPublicKey(seckey);

  return {
    async signEvent(params) {
      return signEventBySeckey(
        {
          ...params,
          tags: [...(params.tags ?? []), ...(options?.tags ?? [])],
        },
        seckey,
      );
    },
    async getPublicKey() {
      return pubhex;
    },
  };
}
