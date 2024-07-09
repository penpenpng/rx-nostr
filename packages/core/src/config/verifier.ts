import * as Nostr from "nostr-typedef";

export interface EventVerifier {
  (params: Nostr.Event): Promise<boolean>;
}

export const noopVerifier: EventVerifier = async () => true;
