import { once } from "./once.ts";

export class Deferrer {
  #timers = new Set<ReturnType<typeof setTimeout>>();
  #callbacks = new Set<() => void>();

  invoke(callback: () => void, delay: number) {
    if (delay <= 0) {
      callback();
      return;
    }

    const f = once(callback);
    this.#callbacks.add(f);

    const timer = setTimeout(() => {
      this.#timers.delete(timer);
      this.#callbacks.delete(f);
      f();
    }, delay);

    this.#timers.add(timer);
  }

  cancelAll() {
    for (const timer of this.#timers) {
      clearTimeout(timer);
    }

    this.#timers.clear();
    this.#callbacks.clear();
  }

  flushAll() {
    for (const timer of this.#timers) {
      clearTimeout(timer);
    }
    for (const callback of this.#callbacks) {
      callback();
    }

    this.#timers.clear();
    this.#callbacks.clear();
  }
}
