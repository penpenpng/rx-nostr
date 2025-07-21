import { finalize, map, pipe, type OperatorFunction } from "rxjs";

export function mapStored<T, R, S>(
  fn: (value: T, store: S, index: number) => [R, S],
  options: {
    initialStore: S;
    cleanup?: (store: S) => void;
  },
): OperatorFunction<T, R> {
  let store = options.initialStore;

  return pipe(
    map((value, index) => {
      const [result, nextStore] = fn(value, store, index);
      store = nextStore;
      return result;
    }),
    finalize(() => {
      if (options.cleanup) {
        options.cleanup(store);
      }
    }),
  );
}
