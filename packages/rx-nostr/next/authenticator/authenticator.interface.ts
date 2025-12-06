import type * as Nostr from "nostr-typedef";
import type { RelayUrl } from "../libs/index.ts";

export interface Authenticator {
  challenge(relay: RelayUrl, challenge: string): Promise<Nostr.Event>;
}
