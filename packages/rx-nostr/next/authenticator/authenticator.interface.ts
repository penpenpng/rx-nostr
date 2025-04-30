import type * as Nostr from "nostr-typedef";
import type { RelayUrl } from "../libs/relay-urls.ts";

export interface Authenticator {
  challenge(relay: RelayUrl, challenge: string): Promise<Nostr.Event>;
}
