export function defineDefaultOptions<T extends Record<string, unknown>>(
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
