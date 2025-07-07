import { scan, type OperatorFunction } from "rxjs";

// TODO: 使わないかも。使わなかったら消す。ほかのも。
export function withPrevious<T>(): OperatorFunction<T, [T | undefined, T]> {
  return scan(
    ([_, prev]: [T | undefined, T], next: T) => {
      return [prev, next];
    },
    [undefined, undefined] as [T | undefined, T],
  );
}
