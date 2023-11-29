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

export function subtract<T extends string | number>(x: T[], y: T[]): T[] {
  return x.filter((e) => !y.includes(e));
}
