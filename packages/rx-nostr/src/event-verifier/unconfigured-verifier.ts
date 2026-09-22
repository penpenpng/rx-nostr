import type { EventVerifier } from "./event-verifier.interface.ts";

/** @internal Fail-closed fallback used until an application configures a real verifier. */
export class UnconfiguredVerifier implements EventVerifier {
  async verifyEvent(): Promise<boolean> {
    throw new Error(
      "You must configure a valid verifier before querying. In most cases, @rx-nostr/crypto will help you.",
    );
  }
}
