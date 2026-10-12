import type * as Nostr from "nostr-typedef";

import type { RelayUrl } from "../libs/index.ts";

export interface Nip42Authenticator {
  /** How long to wait for the relay's OK response to the AUTH event, in milliseconds. */
  /** OK wait in ms; 0 is immediate and Infinity disables the deadline. */
  readonly authTimeout?: number;
  challenge(relay: RelayUrl, challenge: string): Promise<Nostr.Event<22242>>;
}

export type Nip42AuthenticatorFactory = (relay: RelayUrl) => Nip42Authenticator | undefined;

export type Nip42AuthenticatorInput = Nip42Authenticator | Nip42AuthenticatorFactory;
