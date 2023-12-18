import { EventSigner } from "./signer.js";

export interface Authenticator {
  strategy: AuthStrategy;
  store?: ChallengeStore;
  signer?: EventSigner;
}

export type AuthStrategy = "aggressive" | "passive";

export interface ChallengeStore {
  get?: (pubkey: string, relay: string) => Promise<string | undefined>;
  save?: (pubkey: string, relay: string, challenge: string) => void;
}

export function localStorageChallengeStore(): ChallengeStore {
  return {
    get() {},
    save() {},
  };
}
