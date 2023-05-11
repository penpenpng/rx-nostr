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
