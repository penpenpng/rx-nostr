import Nostr from "nostr-typedef";

import { fetchRelayInfo } from "./nostr/nip11.js";
import { normalizeRelayUrl } from "./util.js";

export class Nip11Registry {
  private static cache: Record<string, Promise<Nostr.Nip11.RelayInfo>> = {};
  private static default: Nostr.Nip11.RelayInfo = {};

  static async getOrFetch(url: string): Promise<Nostr.Nip11.RelayInfo> {
    url = normalizeRelayUrl(url);

    return this.cache[url] ?? this.fetch(url);
  }

  static async getOrDefault(url: string): Promise<Nostr.Nip11.RelayInfo> {
    url = normalizeRelayUrl(url);

    return this.cache[url] ?? this.default;
  }

  static set(url: string, nip11: Nostr.Nip11.RelayInfo) {
    url = normalizeRelayUrl(url);

    this.cache[url] = Promise.resolve(nip11);
  }

  static setDefault(nip11: Nostr.Nip11.RelayInfo) {
    this.default = nip11;
  }

  static async fetch(url: string) {
    url = normalizeRelayUrl(url);

    this.cache[url] = fetchRelayInfo(url);
    return this.cache[url];
  }

  static forget(url: string) {
    url = normalizeRelayUrl(url);

    delete this.cache[url];
  }

  static forgetAll() {
    this.cache = {};
  }
}
