import { EventSigner } from "./signer.js";

export type AuthenticatorConfig = Authenticator | "auto";

export interface Authenticator {
  signer?: EventSigner;
}
