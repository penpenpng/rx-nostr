import Nostr from "nostr-typedef";

import { RxNostrEnvironmentError } from "../error.js";
import { toHex } from "../nostr/bech32.js";
import {
  ensureEventFields,
  getEventHash,
  getPublicKey,
  getSignature,
} from "../nostr/event.js";
import { inlineThrow } from "../utils.js";

export interface EventSigner {
  signEvent(params: Nostr.EventParameters): Promise<Nostr.Event>;
  getPublicKey(): Promise<string>;
}

export function nip07Signer(): EventSigner {
  return {
    async signEvent(params) {
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

export function seckeySigner(seckey: string): EventSigner {
  const sechex = seckey.startsWith("nsec1") ? toHex(seckey) : seckey;
  const pubhex = getPublicKey(sechex);

  return {
    async signEvent(params) {
      const event = {
        ...params,
        pubkey: params.pubkey ?? pubhex,
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
    },
    async getPublicKey() {
      return pubhex;
    },
  };
}
