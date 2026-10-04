import type { Observer } from "rxjs";

import { QueueInspector } from "./queue-inspector";

const ObservableComplete = Symbol("complete");
type ObservableComplete = typeof ObservableComplete;

class ObservableError {
  constructor(public error: unknown) {}
}

export class SubscriptionInspector<T> implements Observer<T> {
  #events = new QueueInspector<T | ObservableError | ObservableComplete>();
  #values: T[] = [];

  #complete = Promise.withResolvers<void>();
  #completed = false;

  #error = Promise.withResolvers<unknown>();
  #errored = false;

  next(value: T) {
    this.#values.push(value);
    this.#events.push(value);
  }
  error(err: unknown) {
    if (this.#errored) {
      return;
    }

    this.#errored = true;
    this.#error.resolve(err);
    this.#events.push(new ObservableError(err));
  }
  complete() {
    if (this.#completed) {
      return;
    }

    this.#completed = true;
    this.#complete.resolve();
    this.#events.push(ObservableComplete);
  }

  async waitNext() {
    const v = await this.#events.waitNext();

    if (v instanceof ObservableError) {
      throw new SubscriptionInspectorError("Observable has thrown an error", { cause: v.error });
    }
    if (v === ObservableComplete) {
      throw new SubscriptionInspectorError("Observable has been completed");
    }

    return v;
  }
  async waitError() {
    return this.#error.promise;
  }
  async waitComplete() {
    return this.#complete.promise;
  }

  async ignoreNexts(counts: number) {
    this.#events.ignoreNexts(counts);
  }

  get length() {
    return this.#values.length;
  }

  get errored() {
    return this.#errored;
  }

  get completed() {
    return this.#completed;
  }
  get values() {
    return this.#values;
  }
}

class SubscriptionInspectorError extends Error {
  name = "SubscriptionInspectorError";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}
