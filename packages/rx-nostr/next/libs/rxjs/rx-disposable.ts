import { BehaviorSubject, Subject, Subscription, takeUntil } from "rxjs";

export class RxDisposables extends DisposableStack {
  private _disposed = false;
  private dispose$ = new Subject<void>();
  private subs = new Subscription();

  get disposed(): boolean {
    return this._disposed;
  }

  constructor() {
    super();
    this.add(this.dispose$);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  add<T extends Subscription | Subject<any> | BehaviorSubject<any>>(
    resource: T,
  ): T {
    if (resource instanceof Subscription) {
      this.subs.add(resource);
    } else if (
      resource instanceof Subject ||
      resource instanceof BehaviorSubject
    ) {
      this.defer(() => {
        resource.complete();
      });
    }

    return resource;
  }

  whileAlive() {
    return takeUntil(this.dispose$);
  }

  [Symbol.dispose]() {
    if (this._disposed) {
      return;
    }
    this._disposed = true;

    this.subs.unsubscribe();

    this.dispose$.next();
    this.dispose$.complete();

    super[Symbol.dispose]();
  }

  dispose(): void {
    this[Symbol.dispose]();
  }
}
