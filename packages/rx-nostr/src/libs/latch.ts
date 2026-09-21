import { once } from "./once.ts";

export class Latch {
  private _holders = 0;
  get holders(): number {
    return this._holders;
  }

  constructor(
    private handlers: {
      onHeldUp?: () => void;
      onDropped?: () => void;
    },
  ) {}

  hold(): () => void {
    if (this._holders <= 0) {
      this.handlers.onHeldUp?.();
    }
    this._holders++;

    const drop = once(() => {
      this._holders--;
      if (this._holders <= 0) {
        this.handlers.onDropped?.();
      }
    });

    return drop;
  }

  get isHeld(): boolean {
    return this._holders > 0;
  }
}
