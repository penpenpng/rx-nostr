import {
  catchError,
  pipe,
  timeout,
  TimeoutError,
  type ObservableInput,
  type OperatorFunction,
} from "rxjs";

export function timeoutWith<T, R>(
  input: ObservableInput<R>,
  time: number,
): OperatorFunction<T, T | R> {
  return pipe(
    timeout(time),
    catchError((error: unknown) => {
      if (error instanceof TimeoutError) {
        return input;
      } else {
        throw error;
      }
    }),
  );
}
