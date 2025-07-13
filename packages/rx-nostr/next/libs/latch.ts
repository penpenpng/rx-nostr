import { once } from "./once.ts";

export class Latch {
  private holders = 0;

  constructor(
    private handlers: {
      onLatched?: () => void;
      onUnlatched?: () => void;
    },
  ) {}

  hold() {
    if (this.holders <= 0) {
      this.handlers.onLatched?.();
    }
    this.holders++;

    const drop = once(() => {
      this.holders--;
      if (this.holders <= 0) {
        this.handlers.onUnlatched?.();
      }
    });

    return drop;
  }

  get isLatched(): boolean {
    return this.holders > 0;
  }
}
