import type * as Nostr from "nostr-typedef";
import type { EventSigner } from "../event-signer/index.ts";
import type { Authenticator } from "./authenticator.interface.ts";

export class SimpleAuthenticator implements Authenticator {
  constructor(private readonly signer: EventSigner) {}

  challenge(relay: string, challenge: string): Promise<Nostr.Event> {
    return this.signer.signEvent({
      kind: 22242,
      content: "",
      tags: [
        ["relay", relay],
        ["challenge", challenge],
      ],
    });
  }
}
