import { map, type OperatorFunction } from "rxjs";

export function setDiff<T>(options?: { seed?: Set<T> }): OperatorFunction<Set<T>, SetDiff<T>> {
  let previous = new Set(options?.seed);

  return map((values) => {
    const current = new Set(values);
    const appended = current.difference(previous);
    const outdated = previous.difference(current);

    previous = current;

    return { appended, outdated, current: new Set(current) };
  });
}

export interface SetDiff<T> {
  appended?: Set<T>;
  outdated?: Set<T>;
  current: Set<T>;
}
