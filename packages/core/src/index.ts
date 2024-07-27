export type * from "./config/index.js";
export { nip07Signer, noopSigner, noopVerifier } from "./config/index.js";
export * from "./error.js";
export * from "./lazy-filter.js";
export { Nip11Registry } from "./nip11.js";
export { toHex } from "./nostr/bech32.js";
export { compareEvents, earlierEvent, laterEvent } from "./nostr/event.js";
export { isFiltered } from "./nostr/filter.js";
export { fetchRelayInfo } from "./nostr/nip11.js";
export { isExpired } from "./nostr/nip40.js";
export * from "./operator.js";
export * from "./packet.js";
export * from "./rx-nostr/index.js";
export type * from "./websocket.js";

export function now(): number {
  return Math.floor(Date.now() / 1000);
}
