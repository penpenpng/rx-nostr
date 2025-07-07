import { Observable, type MonoTypeOperatorFunction } from "rxjs";

export function finalizeWithLast<T>(
  callback: (lastValue: T | undefined) => void,
): MonoTypeOperatorFunction<T> {
  return (source: Observable<T>) =>
    new Observable<T>((subscriber) => {
      let lastValue: T | undefined;

      const subscription = source.subscribe({
        next(value) {
          lastValue = value;
          subscriber.next(value);
        },
        error(err) {
          subscriber.error(err);
        },
        complete() {
          try {
            callback(lastValue);
          } catch (err) {
            subscriber.error(err);
            return;
          }
          subscriber.complete();
        },
      });

      return () => {
        subscription.unsubscribe();
      };
    });
}
