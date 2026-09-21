export namespace u {
  export namespace Set {
    const Set = globalThis.Set;

    export function union<T>(...sets: Set<T>[]): Set<T> {
      return sets.reduce((acc, set) => acc.union(set), new Set<T>());
    }

    export function intersection<T>(...sets: Set<T>[]): Set<T> {
      return sets.reduce((acc, set) => acc.intersection(set), new Set<T>());
    }
  }

  export namespace Promise {
    const Promise = globalThis.Promise;

    export class TimeoutError extends Error {}

    export function timeout<T>(
      promise: Promise<T>,
      timeout: number,
    ): Promise<T> {
      const ret = Promise.withResolvers<T>();

      const timer = setTimeout(() => {
        ret.reject(new TimeoutError());
      }, timeout);

      promise
        .then(ret.resolve)
        .catch(ret.reject)
        .finally(() => {
          clearTimeout(timer);
        });

      return ret.promise;
    }
  }

  export namespace Iterable {
    type Iterable<T> = globalThis.Iterable<T>;
    export function zip<T, U>(
      a: Iterable<T>,
      b: Iterable<U>,
    ): Iterable<[T, U]> {
      return {
        [Symbol.iterator]: function* () {
          const ia = a[Symbol.iterator]();
          const ib = b[Symbol.iterator]();

          while (true) {
            const na = ia.next();
            const nb = ib.next();
            if (na.done || nb.done) {
              break;
            }
            yield [na.value, nb.value];
          }
        },
      };
    }
  }
}
