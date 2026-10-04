export class QueueInspector<T> {
  #array: (T | Waiting<T>)[] = [];
  #writeIndex = 0;
  #readIndex = 0;

  push(value: T): void {
    const maybeWaiting = this.#array[this.#writeIndex];

    if (maybeWaiting instanceof Waiting) {
      maybeWaiting.resolve(value);
    }

    this.#array[this.#writeIndex] = value;

    this.#writeIndex++;
  }

  wait(index: number): Promise<T> {
    if (!Object.hasOwn(this.#array, index)) {
      const waiting = new Waiting<T>();

      this.#array[index] = waiting;

      return waiting.promise;
    }

    const valueOrWaiting = this.#array[index];

    if (valueOrWaiting instanceof Waiting) {
      const waiting = valueOrWaiting;

      return waiting.promise;
    } else {
      const value = valueOrWaiting;

      return Promise.resolve(value);
    }
  }

  waitNext(): Promise<T> {
    return this.wait(this.#readIndex++);
  }

  takeNext(): T {
    const value = this.#array[this.#readIndex];
    if (this.#readIndex >= this.#writeIndex || value instanceof Waiting) {
      throw new Error("No queued value available");
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
}

class Waiting<T> {
  #resolve: (value: T) => void;
  #promise: Promise<T>;
  #resolved = false;
  #timer: ReturnType<typeof setTimeout>;

  constructor(timeout = 100) {
    const { promise, resolve, reject } = Promise.withResolvers<T>();

    this.#promise = promise;
    this.#resolve = resolve;
    this.#timer = setTimeout(() => {
      if (this.#resolved) {
        return;
      }

      reject();
    }, timeout);
  }

  get promise() {
    return this.#promise;
  }

  resolve(value: T) {
    if (this.#resolved) {
      return;
    }

    this.#resolved = true;
    clearTimeout(this.#timer);
    this.#resolve(value);
  }
}
