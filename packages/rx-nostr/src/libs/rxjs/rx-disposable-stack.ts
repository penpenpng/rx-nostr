import {
  BehaviorSubject,
  finalize,
  Subject,
  Subscription,
  take,
  takeUntil,
} from "rxjs";
import { RxNostrInvalidUsageError } from "../error.ts";

export class RxDisposableStack extends DisposableStack {
  private _disposed = false;
  private subs = new Subscription();

  get disposed(): boolean {
    return this._disposed;
  }

  constructor() {
    super();
  }

  move(): DisposableStack {
    throw new RxNostrInvalidUsageError(
      "`move()` is not supported in `RxDisposableStack`.",
    );
  }

  /**
   * Adds a RxJS resource to the stack.
   * Note that RxJS Subscriptions added here will be unsubscribe before the all other resources are disposed.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  add<T extends Subscription | Subject<any> | BehaviorSubject<any>>(
    resource: T,
  ): T {
    if (this._disposed) {
      if (resource instanceof Subscription) {
        resource.unsubscribe();
      } else if (
        resource instanceof Subject ||
        resource instanceof BehaviorSubject
      ) {
        resource.complete();
      }

      return resource;
    }

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

  private memo = new Set<Disposable>();

  /**
   * Temporarily registers a resource, and returns a function that can be used to unregister it.
   * Due to technical constraints, resources registered in this way will
   * be disposed after all other resources registered through different methods,
   * and the disposal order among them is not guaranteed.
   */
  temporary<T extends Disposable>(value: T): () => void {
    if (this._disposed) {
      return () => void 0;
    }

    this.memo.add(value);

    const forget = () => {
      this.memo.delete(value);
    };

    return forget;
  }

  private dispose$ = new Subject<void>();

  untilDisposed() {
    if (this._disposed) {
      return take(0);
    }

    return takeUntil(this.dispose$);
  }

  finalize() {
    return finalize(() => {
      this.dispose();
    });
  }

  [Symbol.dispose]() {
    if (this._disposed) {
      return;
    }
    this._disposed = true;

    // Unsubscribe first,
    this.subs.unsubscribe();

    // then stop all `untilDisposed()` streams,
    this.dispose$.next();
    this.dispose$.complete();

    // finally dispose all disposables.
    super[Symbol.dispose]();

    for (const value of this.memo) {
      value[Symbol.dispose]();
    }
    this.memo.clear();
  }

  dispose(): void {
    this[Symbol.dispose]();
  }
}
