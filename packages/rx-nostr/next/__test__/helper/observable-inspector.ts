import type { Observable, Subscriber, Subscription } from "rxjs";
import { assert, expect, vi } from "vitest";
import { AwaitableQueue } from "../../libs/awaitable-queue.ts";
import { u } from "../../libs/utils.ts";

const ObservableError = Symbol("observable-error");
const Empty = Symbol("empty");
type ObservableError = typeof ObservableError;

export class ObservableInspector<T> {
  private queue = new AwaitableQueue<T | ObservableError>();
  private completed = false;
  private error: unknown = Empty;
  private errorPopped = false;

  get isComplete(): boolean {
    return this.completed;
  }

  get isError(): boolean {
    return this.error !== Empty;
  }

  get getError() {
    return this.error;
  }

  constructor(private obs: Observable<T>) {}

  subscribe(subscriber?: Subscriber<T>): Subscription {
    return this.obs.subscribe({
      next: (value) => {
        this.queue.enqueue(value);
        subscriber?.next(value);
      },
      error: (err) => {
        this.error = err;
        subscriber?.error(err);
      },
      complete: () => {
        this.completed = true;
        subscriber?.complete();
      },
    });
  }

  async expectNext(expected: unknown, timeout = 100): Promise<void> {
    if (this.errorPopped) {
      assert.fail(this.error, expected);
    }

    try {
      const value = await this.queue.dequeue(timeout);

      if (value === ObservableError) {
        this.errorPopped = true;
        assert.fail(this.error, expected);
      } else {
        // FIXME: Use toMatchObject(). And fix Faker.
        expect(value).toEqual(expected);
      }
    } catch (err) {
      if (err instanceof u.Promise.TimeoutError) {
        assert.fail("timeout", expected);
      } else {
        throw err;
      }
    }
  }

  async expectComplete(timeout = 100): Promise<void> {
    await vi.waitFor(() => {
      try {
        expect(this.isComplete).toBe(true);
      } catch {
        assert.fail("Expected observable to complete, but it did not.");
      }
    }, timeout);
  }
}
