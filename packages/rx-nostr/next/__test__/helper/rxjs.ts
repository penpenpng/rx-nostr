import type { Observable } from "rxjs";

export interface ObservableTestHelper<T> {
  pop(): Promise<T>;
  getValues(): T[];
  isComplete(): boolean;
  isError(): boolean;
  getError(): unknown;
}

export function observe<T>(obs: Observable<T>): ObservableTestHelper<T> {
  const resolvers: Array<(value: T) => void> = [];
  const unresolve: T[] = [];
  const values: T[] = [];
  const { reject, promise: finished } = Promise.withResolvers<never>();

  let error: unknown = null;
  let state: "alive" | "error" | "complete" = "alive";

  obs.subscribe({
    next(value) {
      values.push(value);

      if (resolvers.length > 0) {
        const resolve = resolvers.shift();
        if (resolve) {
          resolve(value);
        }
      } else {
        unresolve.push(value);
      }
    },
    error(err) {
      error = err;
      state = "error";
      reject(err);
    },
    complete() {
      state = "complete";
      reject("completed");
    },
  });

  return {
    async pop() {
      if (unresolve.length > 0) {
        return unresolve.shift()!;
      } else {
        const { resolve, promise } = Promise.withResolvers<T>();
        resolvers.push(resolve);
        return Promise.race([promise, finished]);
      }
    },
    getValues() {
      return values;
    },
    isComplete() {
      return state === "complete";
    },
    isError() {
      return state === "error";
    },
    getError() {
      return error;
    },
  };
}
