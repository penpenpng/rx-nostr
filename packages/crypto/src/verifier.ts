import * as Nostr from "nostr-typedef";

import { verify } from "./crypto.js";

export interface EventVerifier {
  (params: Nostr.Event): Promise<boolean>;
}

export const verifier: EventVerifier = async (event: Nostr.Event) =>
  verify(event);
