import { once } from "./once.ts";

export class Latch {
  private _holders = 0;
  get holders(): number {
    return this._holders;
  }

  constructor(
    private handlers: {
      onLatched?: () => void;
      onUnlatched?: () => void;
    },
  ) {}

  hold(): () => void {
    if (this._holders <= 0) {
      this.handlers.onLatched?.();
    }
    this._holders++;

    const drop = once(() => {
      this._holders--;
      if (this._holders <= 0) {
        this.handlers.onUnlatched?.();
      }
    });

    return drop;
  }

  get isLatched(): boolean {
    return this._holders > 0;
  }
}
