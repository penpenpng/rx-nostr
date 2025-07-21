import { Observable, type MonoTypeOperatorFunction } from "rxjs";

/**
 * Executes a side effect only once for the first emitted value.
 * Subsequent values pass through without triggering the side effect.
 */
export function tapOnce<T>(
  callback: (value: T) => void,
): MonoTypeOperatorFunction<T> {
  return (source: Observable<T>) =>
    new Observable<T>((subscriber) => {
      let hasExecuted = false;

      const subscription = source.subscribe({
        next(value) {
          if (!hasExecuted) {
            try {
              callback(value);
            } catch (err) {
              subscriber.error(err);
              return;
            }
            hasExecuted = true;
          }
          subscriber.next(value);
        },
        error(err) {
          subscriber.error(err);
        },
        complete() {
          subscriber.complete();
        },
      });

      return () => {
        subscription.unsubscribe();
      };
    });
}
