import type * as Nostr from "nostr-typedef";
import { RxNostrInvalidUsageError } from "../libs/error.ts";
import type { EventSigner } from "./event-signer.interface.ts";

export class NoopSigner implements EventSigner {
  async signEvent<K extends number>(params: Nostr.EventParameters<K>) {
    return params as Nostr.Event<K>;
  }

  async getPublicKey(): Promise<string> {
    throw new RxNostrInvalidUsageError("noopSigner cannot calculate pubkey.");
  }
}
