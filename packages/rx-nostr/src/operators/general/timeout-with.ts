import { catchError, EMPTY, of, TimeoutError, type OperatorFunction } from "rxjs";

export function timeoutWith<T, R = void>(lastValue?: R): OperatorFunction<T, T | R> {
  return catchError((error: unknown) => {
    if (error instanceof TimeoutError) {
      return lastValue === undefined ? EMPTY : of(lastValue);
    } else {
      throw error;
    }
  });
}
