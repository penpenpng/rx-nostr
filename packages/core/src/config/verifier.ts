import * as Nostr from "nostr-typedef";

export interface EventVerifier {
  (params: Nostr.Event): Promise<boolean>;
}

export const noopVerifier: EventVerifier = async () => true;

export const emptyVerifier: EventVerifier = async () => {
  throw new Error(
    "You must give some verifier to createRxNostr(). In most cases, rx-nostr-crypto packages will help you.",
  );
};
