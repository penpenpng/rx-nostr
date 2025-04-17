import { delay, map, pipe, tap, type MonoTypeOperatorFunction } from "rxjs";
import { RxNostrLogicError } from "../libs/error.ts";

/**
 * Buffer the received values for a specified time
 * and return the values in sorted order as possible.
 */
export function sort<T>(bufferTime: number, compareFn: (a: T, b: T) => number): MonoTypeOperatorFunction<T> {
  const buffer: T[] = [];

  return pipe(
    tap((v) => {
      buffer.push(v);
      buffer.sort(compareFn);
    }),
    delay(bufferTime),
    map(() => {
      if (buffer.length <= 0) {
        throw new RxNostrLogicError();
      }
      // Non-null is valid because the length has been checked.

      return buffer.shift()!;
    }),
  );
}
