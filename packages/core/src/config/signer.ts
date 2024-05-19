import Nostr from "nostr-typedef";

import { RxNostrEnvironmentError } from "../error.js";
import { toHex } from "../nostr/bech32.js";
import {
  ensureEventFields,
  getEventHash,
  getPublicKey,
  getSignature,
} from "../nostr/event.js";
import { schnorr, sha256 } from "../nostr/hash.js";
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

interface WithDelegationParams {
  delegateeSigner: EventSigner;
  delegatorSeckey: string;
  allowedKinds?: number[];
  allowedSince?: number;
  allowedUntil?: number;
}

export function delegateSigner({
  delegateeSigner,
  delegatorSeckey,
  allowedKinds,
  allowedSince,
  allowedUntil,
}: WithDelegationParams): EventSigner {
  const delegatorPubkey = schnorr.getPublicKey(delegatorSeckey);
  const conditions = allowedKinds?.map((k) => `kind=${k}`) ?? [];
  if (allowedSince !== undefined) {
    conditions.push(`created_at>${allowedSince}`);
  }
  if (allowedUntil !== undefined) {
    conditions.push(`created_at<${allowedUntil}`);
  }
  const query = conditions.join("&");

  const getDelegationTag = async () => {
    const delegateePubkey = await delegateeSigner.getPublicKey();

    const token = schnorr.sign(
      sha256(`nostr:${delegateePubkey}:${query}`),
      delegatorSeckey
    );

    return ["delegation", delegatorPubkey, query, token];
  };

  return {
    async signEvent(params) {
      return delegateeSigner.signEvent({
        ...params,
        tags: [...(params.tags ?? []), await getDelegationTag()],
      });
    },
    getPublicKey: delegateeSigner.getPublicKey,
  };
}
