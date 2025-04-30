import type { Subscribable } from "rxjs";

export interface ObservableTestHelper<T> {
  pop(): Promise<T>;
  getValues(): T[];
  isComplete(): boolean;
  isError(): boolean;
  getError(): unknown;
  unsubscribe(): void;
}

export function subscribe<T>(obs: Subscribable<T>): ObservableTestHelper<T> {
  const resolvers: Array<(value: T) => void> = [];
  const unresolve: T[] = [];
  const values: T[] = [];

  const COMPLETE = Symbol("complete");
  const ERROR = Symbol("error");
  const { resolve: finish, promise: finished } = Promise.withResolvers<
    typeof COMPLETE | typeof ERROR
  >();

  let error: unknown = null;
  let state: "alive" | "error" | "complete" = "alive";

  const sub = obs.subscribe({
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
      finish(ERROR);
    },
    complete() {
      state = "complete";
      finish(COMPLETE);
    },
  });

  return {
    async pop() {
      if (unresolve.length > 0) {
        return unresolve.shift()!;
      } else {
        const { resolve, promise } = Promise.withResolvers<T>();
        resolvers.push(resolve);

        const result = await Promise.race([promise, finished]);

        if (result === COMPLETE) {
          throw new Error("[TestHelper] Observable was completed");
        }
        if (result === ERROR) {
          throw error;
        }

        return result;
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
    unsubscribe() {
      sub.unsubscribe();
    },
  };
}
