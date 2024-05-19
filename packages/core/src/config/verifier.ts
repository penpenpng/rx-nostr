import * as Nostr from "nostr-typedef";

export interface EventVerifier {
  (params: Nostr.Event): boolean;
}

export const noopVerifier: EventVerifier = () => true;
