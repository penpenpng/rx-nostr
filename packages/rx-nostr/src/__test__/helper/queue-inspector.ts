export class QueueInspector<T> implements Iterable<T> {
  #array: (T | Waiting<T>)[] = [];
  #writeIndex = 0;
  #readIndex = 0;

  constructor(
    readonly name = "QueueInspector",
    readonly timeout = 100,
  ) {}

  push(value: T): void {
    const maybeWaiting = this.#array[this.#writeIndex];

    if (maybeWaiting instanceof Waiting) {
      maybeWaiting.resolve(value);
    }

    this.#array[this.#writeIndex++] = value;
  }

  wait(index: number): Promise<T> {
    if (!Object.hasOwn(this.#array, index)) {
      // Capture the stack at the call site, before entering the timer callback.
      const error = new QueueInspectorTimeoutError(this.name, index, this.timeout);
      const waiting = new Waiting<T>(this.timeout, () => {
        error.receivedCount = this.length;
        error.message = `${this.name}: timed out after ${this.timeout}ms waiting for item ${index + 1} (${this.length} received).`;

        return error;
      });

      this.#array[index] = waiting;

      return waiting.promise;
    }

    const value = this.#array[index];

    return value instanceof Waiting ? value.promise : Promise.resolve(value);
  }

  waitNext(): Promise<T> {
    return this.wait(this.#readIndex++);
  }

  takeNext(): T {
    const value = this.#array[this.#readIndex];

    if (this.#readIndex >= this.#writeIndex || value instanceof Waiting) {
      throw new Error(`${this.name}: no queued value available`);
    }

    this.#readIndex++;

    return value;
  }

  ignoreNexts(count: number): void {
    this.#readIndex += count;
  }

  get length() {
    return this.#writeIndex;
  }

  *[Symbol.iterator](): Iterator<T> {
    for (let index = 0; index < this.#writeIndex; index++) {
      yield this.#array[index] as T;
    }
  }
}

export class QueueInspectorTimeoutError extends Error {
  override name = "QueueInspectorTimeoutError";
  receivedCount = 0;

  constructor(
    readonly queueName: string,
    readonly index: number,
    readonly timeout: number,
  ) {
    super(`${queueName}: timed out after ${timeout}ms waiting for item ${index + 1}.`);
  }
}

class Waiting<T> {
  #resolve: (value: T) => void;
  #promise: Promise<T>;
  #settled = false;
  #timer: ReturnType<typeof setTimeout>;

  constructor(timeout: number, onTimeout: () => Error) {
    const { promise, resolve, reject } = Promise.withResolvers<T>();

    this.#promise = promise;
    this.#resolve = resolve;
    this.#timer = setTimeout(() => {
      if (this.#settled) {
        return;
      }

      this.#settled = true;

      reject(onTimeout());
    }, timeout);
  }

  get promise() {
    return this.#promise;
  }

  resolve(value: T) {
    if (this.#settled) {
      return;
    }

    this.#settled = true;

    clearTimeout(this.#timer);
    this.#resolve(value);
  }
}
