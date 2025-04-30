import {
  catchError,
  EMPTY,
  pipe,
  timeout,
  TimeoutError,
  type MonoTypeOperatorFunction,
} from "rxjs";

/**
 * Almost RxJS's `timeout`, but won't throw.
 */
export function completeOnTimeout<T>(
  time: number,
): MonoTypeOperatorFunction<T> {
  return pipe(
    timeout(time),
    catchError((error: unknown) => {
      if (error instanceof TimeoutError) {
        return EMPTY;
      } else {
        throw error;
      }
    }),
  );
}
