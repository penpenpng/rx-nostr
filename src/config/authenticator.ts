import { EventSigner } from "./signer.js";

export interface Authenticator {
  store: ChallengeStore;
  strategy: AuthStrategy;
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

export function inmemoryChallengeStore(): ChallengeStore {
  return {
    get() {},
    save() {},
  };
}
