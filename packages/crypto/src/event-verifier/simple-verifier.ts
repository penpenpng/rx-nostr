import type * as Nostr from "nostr-typedef";
import { verify } from "../libs/nostr/crypto.ts";
import type { EventVerifier } from "./event-verifier.interface.ts";

export class SimpleVerifier implements EventVerifier {
  async verifyEvent(event: Nostr.Event): Promise<boolean> {
    return verify(event);
  }
}
