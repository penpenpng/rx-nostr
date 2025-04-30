export { SeckeySigner, type EventSigner } from "./event-signer/index.ts";
export { SimpleVerifier, type EventVerifier } from "./event-verifier/index.ts";
export {
  generateKeyPair,
  getPublicKey,
  signEvent,
  verifyEvent,
} from "./libs/nostr/crypto.ts";
