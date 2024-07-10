import { BehaviorSubject, first, firstValueFrom, Subject } from "rxjs";

export class CounterSubject extends BehaviorSubject<number> {
  constructor(count?: number) {
    super(count ?? 0);
  }

  increment() {
    this.next(this.getValue() + 1);
  }
  decrement() {
    this.next(this.getValue() - 1);
  }
  next(x: ((v: number) => number) | number) {
    if (typeof x === "number") {
      super.next(x);
    } else {
      super.next(x(this.getValue()));
    }
  }
}

export class NotifySubject<T = void> extends Subject<T> {
  waitNext() {
    return firstValueFrom(this.pipe(first()));
  }
}
