import { once } from "../../libs/index.ts";

interface ConnectionLeaseHandlers {
  readonly onFirstLease: () => void;
  readonly onLastRelease: () => void;
  readonly onDispose: () => void;
}

/** @internal Owns connection demand independently from protocol operations. */
export class ConnectionLeaseController {
  #count = 0;
  #active = false;
  #disposed = false;
  #closeGeneration = 0;

  constructor(private readonly handlers: ConnectionLeaseHandlers) {}

  get count(): number {
    return this.#count;
  }

  get disposed(): boolean {
    return this.#disposed;
  }

  hold(): () => void {
    if (this.#disposed) return () => {};

    this.#count++;
    if (this.#count === 1) {
      // Invalidate a close queued by the preceding release. The underlying
      // session is still active until that queued callback actually runs.
      this.#closeGeneration++;
      if (!this.#active) {
        this.#active = true;
        this.handlers.onFirstLease();
      }
    }

    return once(() => {
      if (this.#disposed) return;
      this.#count--;
      if (this.#count !== 0) return;

      const generation = ++this.#closeGeneration;
      queueMicrotask(() => {
        if (
          this.#disposed ||
          this.#count !== 0 ||
          generation !== this.#closeGeneration ||
          !this.#active
        ) {
          return;
        }
        this.#active = false;
        this.handlers.onLastRelease();
      });
    });
  }

  [Symbol.dispose] = once(() => {
    this.#disposed = true;
    this.#count = 0;
    this.#closeGeneration++;
    this.#active = false;
    this.handlers.onDispose();
  });
  dispose = this[Symbol.dispose];
}
