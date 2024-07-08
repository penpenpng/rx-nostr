// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function defineDefault<T extends Record<string, any>>(
  defaultParams: T,
): (givenParams?: Partial<T>) => T {
  return (givenParams) =>
    Object.fromEntries(
      Object.keys(defaultParams).map((key) => [
        key,
        givenParams?.[key] ?? defaultParams[key],
      ]),
    ) as T;
}
