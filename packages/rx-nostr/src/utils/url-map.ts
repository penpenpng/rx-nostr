import { normalizeRelayUrl } from "./normalize-url.js";

export class UrlMap<T> extends Map<string, T> {
  constructor(obj?: Record<string, T>) {
    super();

    if (!obj) {
      return;
    }

    for (const [url, v] of Object.entries(obj)) {
      this.set(normalizeRelayUrl(url), v);
    }
  }
  get(url: string) {
    return super.get(normalizeRelayUrl(url));
  }
  getMany(urls: string[]) {
    const vs: T[] = [];

    for (const url of new Set(urls.map(normalizeRelayUrl))) {
      const v = this.get(url);
      if (v !== undefined) {
        vs.push(v);
      }
    }

    return vs;
  }
  set(url: string, v: T) {
    return super.set(normalizeRelayUrl(url), v);
  }
  has(url: string): boolean {
    return super.has(normalizeRelayUrl(url));
  }
  delete(url: string) {
    return super.delete(normalizeRelayUrl(url));
  }
  toObject(): Record<string, T> {
    const obj: Record<string, T> = {};

    for (const [url, v] of this.entries()) {
      obj[url] = v;
    }

    return obj;
  }
  toKeys(): string[] {
    return [...super.keys()];
  }
  toValues(): T[] {
    return [...super.values()];
  }
  copy() {
    return new UrlMap(this.toObject());
  }
}
