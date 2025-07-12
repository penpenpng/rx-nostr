import type { Observable } from "rxjs";
import { assert, expect } from "vitest";

export interface ObservableTestHelper<T> {
  pop(): Promise<T>;
  expectNext(expected: unknown): Promise<void>;
  peep(): T | undefined;
  getValues(): T[];
  isComplete(): boolean;
  isError(): boolean;
  getError(): unknown;
  unsubscribe(): void;
}

export function subscribe<T>(obs: Observable<T>): ObservableTestHelper<T> {
  const resolvers: Array<(value: T) => void> = [];
  const unresolve: T[] = [];
  const values: T[] = [];

  const COMPLETE = Symbol("complete");
  const ERROR = Symbol("error");
  const TIMEOUT = Symbol("timeout");
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
    async pop(timeout: number = 100) {
      if (unresolve.length > 0) {
        return unresolve.shift()!;
      } else {
        const { resolve, reject, promise } = Promise.withResolvers<T>();
        const timer = setTimeout(() => {
          reject(TIMEOUT);
        }, timeout);
        resolvers.push((v) => {
          clearTimeout(timer);
          resolve(v);
        });

        const result = await Promise.race([promise, finished]);

        if (result === TIMEOUT) {
          throw result;
        }
        if (result === COMPLETE) {
          throw result;
        }
        if (result === ERROR) {
          console.error("[TestHelper] Observable was terminated with an error");
          throw error;
        }

        return result;
      }
    },
    async expectNext(expected: unknown): Promise<void> {
      try {
        const value = await this.pop();
        expect(value).toEqual(expected);
      } catch (err) {
        assert.fail(err, expected);
      }
    },
    peep() {
      if (values.length <= 0) {
        return undefined;
      }

      return values[values.length - 1];
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
