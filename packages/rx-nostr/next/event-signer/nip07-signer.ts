import type * as Nostr from "nostr-typedef";
import {
  ensureEventFields,
  inlineThrow,
  RxNostrEnvironmentError,
} from "../libs/index.ts";
import type { EventSigner } from "./event-signer.interface.ts";

export class Nip07Signer implements EventSigner {
  constructor(private options?: { tags?: Nostr.Tag.Any[] }) {}

  async signEvent<K extends number>(
    params: Nostr.EventParameters<K>,
  ): Promise<Nostr.Event<K>> {
    const event = {
      ...params,
      pubkey:
        params.pubkey ??
        (await window?.nostr?.getPublicKey()) ??
        inlineThrow(
          new RxNostrEnvironmentError(
            "window.nostr.getPublicKey() is not found",
          ),
        ),
      tags: [...(params.tags ?? []), ...(this.options?.tags ?? [])],
      created_at: params.created_at ?? Math.floor(Date.now() / 1000),
    };

    if (ensureEventFields(event)) {
      return event;
    }

    return (
      (await window?.nostr?.signEvent(event)) ??
      inlineThrow(
        new RxNostrEnvironmentError("window.nostr.signEvent() is not found"),
      )
    );
  }
  getPublicKey() {
    return (
      window?.nostr?.getPublicKey() ??
      inlineThrow(
        new RxNostrEnvironmentError("window.nostr.getPublicKey() is not found"),
      )
    );
  }
}
