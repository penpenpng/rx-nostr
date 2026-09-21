import { u } from "./utils.ts";

export class AwaitableQueue<T> {
  private queue: Array<{ value: T; resolve: () => void }> = [];
  private resolvers: Array<(value: T) => void> = [];

  /** Enqueue a value and return a promise, which is resolved when the value is dequeued. */
  async enqueue(value: T, timeout?: number): Promise<void> {
    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift();
      if (resolve) {
        resolve(value);
      }
    } else {
      const { promise, resolve } = Promise.withResolvers<void>();
      this.queue.push({ value, resolve });

      if (timeout) {
        return u.Promise.timeout(promise, timeout);
      } else {
        return promise;
      }
    }
  }

  /** Dequeue a value if exists. Otherwise, wait for the next value. */
  async dequeue(timeout?: number): Promise<T> {
    if (this.queue.length > 0) {
      const { value, resolve } = this.queue.shift()!;
      resolve();
      return value;
    }

    const { promise, resolve } = Promise.withResolvers<T>();

    this.resolvers.push(resolve);

    if (timeout) {
      return u.Promise.timeout(promise, timeout);
    } else {
      return promise;
    }
  }

  dequeueSync(): T {
    if (this.queue.length > 0) {
      const { value, resolve } = this.queue.shift()!;
      resolve();
      return value;
    } else {
      throw new AwaitableQueueEmptyError();
    }
  }
}

export class AwaitableQueueEmptyError extends Error {}
