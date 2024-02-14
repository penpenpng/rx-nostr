import Nostr from "nostr-typedef";

import { verify } from "../nostr/event.js";
import { validateDelegation } from "../nostr/nip26.js";

export interface EventVerifier {
  (params: Nostr.Event): boolean;
}

export const verifier = (event: Nostr.Event) =>
  verify(event) && validateDelegation(event);
