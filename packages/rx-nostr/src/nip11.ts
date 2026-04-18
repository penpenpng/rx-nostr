import * as Nostr from "nostr-typedef";

import { fetchRelayInfo } from "./nostr/nip11.js";
import { UrlMap } from "./utils/url-map.js";

/**
 * This is used by rx-nostr to access NIP-11 relay information.
 * rx-nostr works adaptively to the [`limitation`](https://github.com/nostr-protocol/nips/blob/master/11.md#server-limitations) defined by NIP-11.
 *
 * If you `set()` or `setDefault()` NIP-11 relay information in advance,
 * rx-nostr will use them instead of fetching even if `skipFetchNip11` is enabled.
 */
export class Nip11Registry {
  private static cache = new UrlMap<
    Promise<Nostr.Nip11.RelayInfo> | Nostr.Nip11.RelayInfo
  >();
  private static default: Nostr.Nip11.RelayInfo = {};

  static async getValue<T>(
    url: string,
    getter: (data: Nostr.Nip11.RelayInfo) => T,
    options?: {
      skipFetch?: boolean;
      skipCache?: boolean;
    },
  ): Promise<T> {
    if (!options?.skipCache) {
      const data = await this.cache.get(url);
      if (data) {
        return getter(data);
      }
    }
    if (!options?.skipFetch) {
      const data = await this.fetch(url);
      if (data) {
        return getter(data);
      }
    }

    return getter(this.default);
  }

  /**
   * Return cached or `set()`'ed NIP-11 information.
   */
  static get(url: string): Nostr.Nip11.RelayInfo | undefined {
    const v = this.cache.get(url);
    if (v && !(v instanceof Promise)) {
      return v;
    } else {
      return undefined;
    }
  }

  /**
   * Cache fetched information then return it.
   */
  static async fetch(url: string) {
    const promise = fetchRelayInfo(url);

    this.cache.set(url, promise);
    promise.then((v) => {
      this.cache.set(url, v);
    });

    return promise;
  }

  /**
   * Return cached or `set()`'ed NIP-11 information,
   * or cache fetched information then return it.
   */
  static async getOrFetch(url: string): Promise<Nostr.Nip11.RelayInfo> {
    return this.cache.get(url) ?? this.fetch(url);
  }

  /**
   * Set NIP-11 information manually for given relay URL.
   */
  static set(url: string, nip11: Nostr.Nip11.RelayInfo) {
    this.cache.set(url, nip11);
  }

  /**
   * Get NIP-11 information for fallback.
   */
  static getDefault(): Nostr.Nip11.RelayInfo {
    return this.default;
  }

  /**
   * Set NIP-11 information for fallback.
   */
  static setDefault(nip11: Nostr.Nip11.RelayInfo) {
    this.default = nip11;
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
