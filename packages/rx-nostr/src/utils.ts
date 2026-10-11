export { evalFilters } from "./lazy-filter/index.ts";
export { compareEvents, earlierEvent, ensureEventFields, laterEvent } from "./libs/nostr/event.ts";
export { fetchRelayInfo, type FetchRelayInfoOptions } from "./libs/nostr/nip11.ts";
export { normalizeRelayUrl, RelayMap, RelaySet, type RelayUrl } from "./libs/relay-urls.ts";
export { RxDisposableStack } from "./libs/rxjs/rx-disposable-stack.ts";

/** Current UNIX timestamp in seconds. */
export function now(): number {
  return Math.floor(Date.now() / 1000);
}
