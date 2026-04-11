type Callback = () => void;

export class Batch {
  private timer: ReturnType<typeof setInterval>;
  private fireNext: Callback[] = [];
  private takeNext: Callback[] = [];

  constructor(interval: number) {
    this.timer = setInterval(() => {
      for (const f of this.fireNext) {
        f();
      }
      this.fireNext = this.takeNext;
      this.takeNext = [];
    }, interval);
  }

  set(f: Callback) {
    this.takeNext.push(f);
  }

  stop() {
    clearInterval(this.timer);
  }
}
