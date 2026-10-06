import type * as Nostr from "nostr-typedef";

import type { RelayUrl } from "../libs/index.ts";

export interface Authenticator {
  /** How long to wait for the relay's OK response to the AUTH event, in milliseconds. */
  /** OK wait in ms; 0 is immediate and Infinity disables the deadline. */
  readonly authTimeout?: number;
  challenge(relay: RelayUrl, challenge: string): Promise<Nostr.Event<22242>>;
}

export type AuthenticatorFactory = (relay: RelayUrl) => Authenticator | undefined;

export type AuthenticatorInput = Authenticator | AuthenticatorFactory;
