import { inlineTry } from "./error.ts";

export type RelayUrl = `ws://${number}` | `wss://${string}`;

export class RelayMap<T> {
  #map = new Map<RelayUrl, T>();

  constructor(obj?: Record<string, T>, options?: TrustOption) {
    if (!obj) {
      return;
    }

    for (const [url, v] of Object.entries(obj)) {
      this.set(url, v, options);
    }
  }

  get(url: string, options?: TrustOption): T | undefined {
    if (options?.trusted) {
      return this.#map.get(url as RelayUrl);
    }

    const u = normalizeRelayUrl(url);
    if (u === null) {
      return undefined;
    }

    return this.#map.get(u);
  }

  getMany(urls: Iterable<string>, options?: TrustOption): T[] {
    const vs: T[] = [];

    for (const url of new RelaySet(urls, options)) {
      if (this.#map.has(url)) {
        vs.push(this.#map.get(url)!);
      }
    }

    return vs;
  }

  set(url: string, v: T, options?: TrustOption): this {
    if (options?.trusted) {
      this.#map.set(url as RelayUrl, v);
      return this;
    }

    const u = normalizeRelayUrl(url);
    if (u === null) {
      return this;
    }

    this.#map.set(u, v);
    return this;
  }

  setDefault(url: string, v: () => T, options?: TrustOption): this {
    if (this.has(url, options)) {
      return this;
    }

    return this.set(url, v(), options);
  }

  has(url: string, options?: TrustOption): boolean {
    if (options?.trusted) {
      return this.#map.has(url as RelayUrl);
    }

    const u = normalizeRelayUrl(url);
    if (u === null) {
      return false;
    }

    return this.#map.has(u);
  }

  delete(url: string, options?: TrustOption): boolean {
    if (options?.trusted) {
      return this.#map.delete(url as RelayUrl);
    }

    const u = normalizeRelayUrl(url);
    if (u === null) {
      return false;
    }

    return this.#map.delete(u);
  }

  clear() {
    this.#map.clear();
  }

  entries() {
    return this.#map.entries();
  }

  toEntries(): Record<string, T> {
    const obj: Record<string, T> = {};

    for (const [url, v] of this.#map.entries()) {
      obj[url] = v;
    }

    return obj;
  }

  keys() {
    return this.#map.keys();
  }

  toKeys(): string[] {
    return [...this.#map.keys()];
  }

  values() {
    return this.#map.values();
  }

  toValues(): T[] {
    return [...this.#map.values()];
  }

  get size() {
    return this.#map.size;
  }

  copy() {
    return new RelayMap(this.toEntries(), { trusted: true });
  }
}

export class RelaySet {
  #set = new Set<RelayUrl>();

  constructor(urls?: Iterable<string>, options?: TrustOption) {
    if (!urls) {
      return;
    }

    for (const url of urls) {
      this.add(url, options);
    }
  }

  add(url: string, options?: TrustOption) {
    if (options?.trusted) {
      return this.#set.add(url as RelayUrl);
    }

    const u = normalizeRelayUrl(url);
    if (u === null) {
      return this;
    }

    return this.#set.add(u);
  }

  has(url: string, options?: TrustOption): boolean {
    if (options?.trusted) {
      return this.#set.has(url as RelayUrl);
    }

    const u = normalizeRelayUrl(url);
    if (u === null) {
      return false;
    }

    return this.#set.has(u);
  }

  delete(url: string, options?: TrustOption): boolean {
    if (options?.trusted) {
      return this.#set.delete(url as RelayUrl);
    }

    const u = normalizeRelayUrl(url);
    if (u === null) {
      return false;
    }

    return this.#set.delete(u);
  }

  clear() {
    this.#set.clear();
  }

  difference(other: RelaySet): RelaySet {
    return new RelaySet([...this.#set.difference(other.#set)], {
      trusted: true,
    });
  }

  intersection(other: RelaySet): RelaySet {
    return new RelaySet([...this.#set.intersection(other.#set)], {
      trusted: true,
    });
  }

  symmetricDifference(other: RelaySet): RelaySet {
    return new RelaySet([...this.#set.symmetricDifference(other.#set)], {
      trusted: true,
    });
  }

  union(other: RelaySet): RelaySet {
    return new RelaySet([...this.#set.union(other.#set)], { trusted: true });
  }

  keys() {
    return this.#set.keys();
  }

  toSet() {
    return new Set(this.#set);
  }

  get size() {
    return this.#set.size;
  }

  [Symbol.iterator]() {
    return this.#set.values();
  }
}

interface TrustOption {
  trusted?: boolean;
}

export function normalizeRelayUrl(url: string): RelayUrl | null {
  if (typeof url !== "string") {
    return null;
  }
  if (URL.canParse && !URL.canParse(url)) {
    return null;
  }

  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }

  u.hash = "";
  u.pathname = inlineTry(() => decodeURI(u.pathname), u.pathname);
  u.pathname = u.pathname.replace(/\/$/, "");
  u.hostname = u.hostname.replace(/\.$/, "");
  u.searchParams.sort();
  u.search = inlineTry(() => decodeURIComponent(u.search), u.search);

  if (!u.hostname) {
    return null;
  }

  if (!/^wss?:$/.test(u.protocol)) {
    return null;
  }
  let s = u.toString() as RelayUrl;

  if (!u.search) {
    s = s.replace(/\/$/, "") as RelayUrl;
  }

  return s;
}
