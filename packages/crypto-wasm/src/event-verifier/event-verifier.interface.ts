import type * as Nostr from "nostr-typedef";

export interface EventVerifier {
  verifyEvent(params: Nostr.Event): Promise<boolean>;
}
