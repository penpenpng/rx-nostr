import { scan, type OperatorFunction } from "rxjs";

export function diff<T>(): OperatorFunction<Set<T>, SetDiff<T>> {
  return scan<Set<T>, SetDiff<T>>(
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

export interface SetDiff<T> {
  appended?: Set<T>;
  outdated?: Set<T>;
  current: Set<T>;
}
