import * as Nostr from "nostr-typedef";

import { verify } from "./crypto.js";

export interface EventVerifier {
  (params: Nostr.Event): boolean;
}

export const verifier = (event: Nostr.Event) => verify(event);
