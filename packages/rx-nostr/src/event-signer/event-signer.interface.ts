import type * as Nostr from "nostr-typedef";

export interface EventSigner {
  signEvent<K extends number>(params: Nostr.EventParameters<K>): Promise<Nostr.Event<K>>;
  getPublicKey(): Promise<string>;
}
