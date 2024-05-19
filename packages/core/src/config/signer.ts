import * as Nostr from "nostr-typedef";

import { RxNostrEnvironmentError, RxNostrInvalidUsageError } from "../error.js";
import { ensureEventFields } from "../nostr/event.js";
import { inlineThrow } from "../utils.js";

export interface EventSigner {
  signEvent<K extends number>(
    params: Nostr.EventParameters<K>
  ): Promise<Nostr.Event<K>>;
  getPublicKey(): Promise<string>;
}

export function nip07Signer(): EventSigner {
  return {
    async signEvent<K extends number>(
      params: Nostr.EventParameters<K>
    ): Promise<Nostr.Event<K>> {
      const event = {
        ...params,
        pubkey:
          params.pubkey ??
          (await window?.nostr?.getPublicKey()) ??
          inlineThrow(
            new RxNostrEnvironmentError(
              "window.nostr.getPublicKey() is not found"
            )
          ),
        tags: params.tags ?? [],
        created_at: params.created_at ?? Math.floor(Date.now() / 1000),
      };

      if (ensureEventFields(event)) {
        return event;
      }

      return (
        (await window?.nostr?.signEvent(event)) ??
        inlineThrow(
          new RxNostrEnvironmentError("window.nostr.signEvent() is not found")
        )
      );
    },
    getPublicKey() {
      return (
        window?.nostr?.getPublicKey() ??
        inlineThrow(
          new RxNostrEnvironmentError(
            "window.nostr.getPublicKey() is not found"
          )
        )
      );
    },
  };
}

export function noopSigner(): EventSigner {
  return {
    async signEvent<K extends number>(params: Nostr.EventParameters<K>) {
      return params as Nostr.Event<K>;
    },
    async getPublicKey() {
      throw new RxNostrInvalidUsageError("noopSigner cannot calculate pubkey.");
    },
  };
}
