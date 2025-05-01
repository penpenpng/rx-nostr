import {
  catchError,
  EMPTY,
  of,
  TimeoutError,
  type OperatorFunction,
} from "rxjs";

export function sealOnTimeout<T, R = void>(
  lastValue?: R,
): OperatorFunction<T, T | R> {
  return catchError((error: unknown) => {
    if (error instanceof TimeoutError) {
      return lastValue ? of(lastValue) : EMPTY;
    } else {
      throw error;
    }
  });
}
