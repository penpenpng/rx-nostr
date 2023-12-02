import Nostr from "nostr-typedef";

import { fetchRelayInfo } from "./nostr/nip11.js";
import { UrlMap } from "./util.js";

/**
 * This is used by rx-nostr to access NIP-11 relay information.
 * rx-nostr works adaptively to the [`limitation`](https://github.com/nostr-protocol/nips/blob/master/11.md#server-limitations) defined by NIP-11.
 *
 * If you `set()` or `setDefault()` NIP-11 relay information in advance,
 * rx-nostr will use them instead of fetching even if `skipFetchNip11` is enabled.
 */
export class Nip11Registry {
  private static cache = new UrlMap<Promise<Nostr.Nip11.RelayInfo>>();
  private static default: Nostr.Nip11.RelayInfo = {};

  /**
   * Return cached or `set()`'ed NIP-11 information,
   * or cache fetched information then return it.
   */
  static async getOrFetch(url: string): Promise<Nostr.Nip11.RelayInfo> {
    return this.cache.get(url) ?? this.fetch(url);
  }

  /**
   * Return cached or `set()`'ed NIP-11 information,
   * or return default value.
   */
  static async getOrDefault(url: string): Promise<Nostr.Nip11.RelayInfo> {
    return this.cache.get(url) ?? this.default;
  }

  /**
   * Set NIP-11 information manually for given relay URL.
   */
  static set(url: string, nip11: Nostr.Nip11.RelayInfo) {
    this.cache.set(url, Promise.resolve(nip11));
  }

  /**
   * Set NIP-11 information for fallback.
   */
  static setDefault(nip11: Nostr.Nip11.RelayInfo) {
    this.default = nip11;
  }

  /**
   * Cache fetched information then return it.
   */
  static async fetch(url: string) {
    const v = fetchRelayInfo(url);
    this.cache.set(url, v);
    return v;
  }

  /**
   * Forget cached NIP-11 information for given relay URL.
   */
  static forget(url: string) {
    this.cache.delete(url);
  }

  /**
   * Forget all cached NIP-11 information.
   *
   * This doesn't erase `setDefault()`'ed value.
   * If you want it, you can `setDefault({})` instead.
   */
  static forgetAll() {
    this.cache.clear();
  }
}
