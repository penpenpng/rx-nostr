export * from "./error.js";
export * from "./lazy-filter.js";
export { toHex } from "./nostr/bech32.js";
export {
  compareEvents,
  earlierEvent,
  getEventHash,
  getPublicKey,
  getSignature,
  getSignedEvent,
  laterEvent,
} from "./nostr/event.js";
export { isFiltered } from "./nostr/filter.js";
export { fetchRelayInfo } from "./nostr/nip11.js";
export * from "./operator.js";
export * from "./packet.js";
export * from "./req.js";
export * from "./rx-nostr/index.js";

export function now(): number {
  return Math.floor(Date.now() / 1000);
}
