import { Observable, type Subscriber, type Subscription } from "rxjs";
import { once } from "../libs/index.ts";
import type { EventPacket } from "../packets/index.ts";

/**
 * Applies a relay's NIP-11 subscription capacity to REQs.
 * It owns neither the connection nor logical vreq planning.
 */
export class RelayReqScheduler implements ReqScheduler, Disposable {
  readonly #pending = new Set<ReqTask>();
  readonly #active = new Set<ReqTask>();
  #maxSubscriptions?: number;
  #capacityReady = false;
  #disposed = false;
  #drainSuppression = 0;

  setMaxSubscriptions(maxSubscriptions: number | undefined): void {
    this.#maxSubscriptions = maxSubscriptions;
    this.#capacityReady = true;
    this.#drain();
  }

  waitForMaxSubscriptions(): void {
    this.#capacityReady = false;
  }

  schedule(run: ReqRunner): Observable<EventPacket> {
    return new Observable((subscriber) => {
      if (this.#disposed) {
        subscriber.complete();
        return;
      }
      const task: ReqTask = { subscriber, run, started: false, finished: false };
      this.#pending.add(task);
      this.#drain();
      return () => this.#finish(task);
    });
  }

  [Symbol.dispose] = once(() => {
    this.#disposed = true;
    for (const task of [...this.#pending, ...this.#active]) task.subscriber.complete();
    this.#pending.clear();
    this.#active.clear();
  });
  dispose = this[Symbol.dispose];

  #drain(): void {
    if (this.#disposed || this.#drainSuppression > 0 || !this.#capacityReady) return;
    const limit = this.#maxSubscriptions ?? Number.POSITIVE_INFINITY;
    if (limit === 0) {
      for (const task of this.#pending) task.subscriber.complete();
      return;
    }
    while (this.#pending.size > 0 && this.#active.size < limit) {
      const task = this.#pending.values().next().value as ReqTask;
      if (task.finished) {
        this.#pending.delete(task);
        continue;
      }
      this.#pending.delete(task);
      task.started = true;
      this.#active.add(task);
      let terminal: ReqTerminal | undefined;
      try {
        const subscription = task.run().subscribe({
          next: (packet) => task.subscriber.next(packet),
          error: (error) => (terminal = { type: "error", error }),
          complete: () => (terminal = { type: "complete" }),
        });
        task.subscription = subscription;
        // RxJS runs added finalizers after the source teardown. Releasing the slot here
        // ensures a queued REQ cannot start before the old REQ has sent its CLOSE.
        subscription.add(() => {
          if (terminal) this.#terminate(task, terminal);
        });
      } catch (error) {
        this.#terminate(task, { type: "error", error });
      }
    }
  }

  #finish(task: ReqTask): void {
    if (task.finished) return;
    task.finished = true;
    this.#pending.delete(task);
    if (task.started) {
      this.#active.delete(task);
      task.subscription?.unsubscribe();
    }
    this.#drain();
  }

  #terminate(task: ReqTask, terminal: ReqTerminal): void {
    if (task.finished) return;
    task.finished = true;
    this.#active.delete(task);
    // Keep draining suspended while downstream handles the terminal. In particular,
    // merge() must be able to cancel queued sibling plans before another one starts.
    this.#drainSuppression++;
    try {
      if (terminal.type === "error") task.subscriber.error(terminal.error);
      else task.subscriber.complete();
    } finally {
      this.#drainSuppression--;
      this.#drain();
    }
  }
}

/** Starts one Nostr REQ that consumes one NIP-11 subscription slot while active. */
export type ReqRunner = () => Observable<EventPacket>;

export interface ReqScheduler {
  schedule(run: ReqRunner): Observable<EventPacket>;
}

interface ReqTask {
  readonly subscriber: Subscriber<EventPacket>;
  readonly run: ReqRunner;
  started: boolean;
  finished: boolean;
  subscription?: Subscription;
}

type ReqTerminal = Readonly<{ type: "complete" }> | Readonly<{ type: "error"; error: unknown }>;
