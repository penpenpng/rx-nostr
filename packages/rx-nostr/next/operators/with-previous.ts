import { scan, type OperatorFunction } from "rxjs";

export function withPrevious<T>(): OperatorFunction<T, [T | undefined, T]> {
  return scan(
    ([_, prev]: [T | undefined, T], next: T) => {
      return [prev, next];
    },
    [undefined, undefined] as [T | undefined, T],
  );
}
