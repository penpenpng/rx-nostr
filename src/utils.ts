import normalizeUrl from "normalize-url";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function defineDefault<T extends Record<string, any>>(
  defaultParams: T
): (givenParams?: Partial<T>) => T {
  return (givenParams) =>
    Object.fromEntries(
      Object.keys(defaultParams).map((key) => [
        key,
        givenParams?.[key] ?? defaultParams[key],
      ])
    ) as T;
}

export type Override<T extends object, U extends object> = {
  [K in keyof T | keyof U]: K extends keyof U
    ? U[K]
    : K extends keyof T
    ? T[K]
    : never;
};

export function normalizeRelayUrl(url: string) {
  return normalizeUrl(url, {
    normalizeProtocol: false,
    removeTrailingSlash: true,
  });
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

export function subtract<T>(x: T[], y: T[]): T[] {
  return x.filter((e) => !y.includes(e));
}

export function inlineThrow(err: Error): never {
  throw err;
}
