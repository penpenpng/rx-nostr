import { scan, type OperatorFunction } from "rxjs";

export function changelog<T>(): OperatorFunction<Set<T>, Changelog<T>> {
  return scan<Set<T>, Changelog<T>>(
    (acc, values) => {
      const next = values;
      const prev = acc.current;

      return {
        appended: next.difference(prev),
        outdated: prev.difference(next),
        current: next,
      };
    },
    {
      current: new Set(),
    },
  );
}

export interface Changelog<T> {
  appended?: Set<T>;
  outdated?: Set<T>;
  current: Set<T>;
}
