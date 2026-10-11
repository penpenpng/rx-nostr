import type * as Nostr from "nostr-typedef";

import { ensureEventFields, raise, RxNostrEnvironmentError } from "../libs/index.ts";
import type { EventSigner } from "./event-signer.interface.ts";

export class Nip07Signer implements EventSigner {
  async signEvent<K extends number>(params: Nostr.EventParameters<K>): Promise<Nostr.Event<K>> {
    const event = {
      ...params,
      pubkey:
        params.pubkey ??
        (await globalThis.window?.nostr?.getPublicKey()) ??
        raise(new RxNostrEnvironmentError("window.nostr.getPublicKey() is not found")),
      tags: params.tags ?? [],
      created_at: params.created_at ?? Math.floor(Date.now() / 1000),
    };

    if (ensureEventFields(event)) {
      return event;
    }

    return (
      (await globalThis.window?.nostr?.signEvent(event)) ??
      raise(new RxNostrEnvironmentError("window.nostr.signEvent() is not found"))
    );
  }
  async getPublicKey(): Promise<string> {
    return (
      globalThis.window?.nostr?.getPublicKey() ??
      raise(new RxNostrEnvironmentError("window.nostr.getPublicKey() is not found"))
    );
  }
}
