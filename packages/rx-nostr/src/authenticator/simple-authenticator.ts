import type * as Nostr from "nostr-typedef";

import type { EventSigner } from "../event-signer/index.ts";
import { assertTimerDuration } from "../libs/timing.ts";
import { DEFAULT_AUTH_TIMEOUT } from "./authenticator.defaults.ts";
import type { Authenticator } from "./authenticator.interface.ts";

export class SimpleAuthenticator implements Authenticator {
  readonly authTimeout: number;

  constructor(
    private readonly signer: EventSigner,
    options: Readonly<{ authTimeout?: number }> = {},
  ) {
    this.authTimeout = assertTimerDuration(
      options.authTimeout ?? DEFAULT_AUTH_TIMEOUT,
      "authTimeout",
      {
        allowZero: true,
        allowInfinity: true,
      },
    );
  }

  challenge(relay: string, challenge: string): Promise<Nostr.Event<22242>> {
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
