import type { EventVerifier } from "./event-verifier.interface.ts";

/** @internal */
export class DefaultVerifier implements EventVerifier {
  async verifyEvent(): Promise<boolean> {
    throw new Error(
      "You must give a valid verifier to RxNostr constructor. In most cases, @rx-nostr/crypto packages will help you.",
    );
  }
}
