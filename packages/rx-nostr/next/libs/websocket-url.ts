import { inlineTry } from "./error.ts";

export function normalizeWebSocketUrl(url: string): string | null {
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

  if (!/^wss?:$/.test(u.protocol)) {
    return null;
  }
  if (!u.hostname) {
    return null;
  }

  let s = u.toString();
  if (!u.search) {
    s = s.replace(/\/$/, "");
  }

  return s;
}

export class UrlMap<T> extends Map<string, T> {
  constructor(obj?: Record<string, T>) {
    super();

    if (!obj) {
      return;
    }

    for (const [url, v] of Object.entries(obj)) {
      this.set(url, v);
    }
  }
  get(url: string) {
    const u = normalizeWebSocketUrl(url);
    if (u === null) {
      return undefined;
    }

    return super.get(u);
  }
  getMany(urls: string[]) {
    const vs: T[] = [];

    for (const url of new Set(urls.map(normalizeWebSocketUrl))) {
      if (url === null) {
        continue;
      }

      if (this.has(url)) {
        vs.push(this.get(url)!);
      }
    }

    return vs;
  }
  set(url: string, v: T) {
    const u = normalizeWebSocketUrl(url);
    if (u === null) {
      return this;
    }

    return super.set(u, v);
  }
  has(url: string): boolean {
    const u = normalizeWebSocketUrl(url);
    if (u === null) {
      return false;
    }

    return super.has(u);
  }
  delete(url: string) {
    const u = normalizeWebSocketUrl(url);
    if (u === null) {
      return false;
    }

    return super.delete(u);
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

export class UrlSet extends Set<string> {
  constructor(obj?: string[]) {
    super();

    if (!obj) {
      return;
    }

    for (const url of obj) {
      this.add(url);
    }
  }
  add(url: string) {
    const u = normalizeWebSocketUrl(url);
    if (u === null) {
      return this;
    }

    return super.add(u);
  }
  has(url: string): boolean {
    const u = normalizeWebSocketUrl(url);
    if (u === null) {
      return false;
    }

    return super.has(u);
  }
  delete(url: string) {
    const u = normalizeWebSocketUrl(url);
    if (u === null) {
      return false;
    }

    return super.delete(u);
  }
}
