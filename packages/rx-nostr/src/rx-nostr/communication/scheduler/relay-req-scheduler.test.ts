import { Observable, Subject, tap } from "rxjs";
import { describe, expect, test, vi } from "vitest";

import { SubscriptionInspector } from "../../../__test__/helper/subscription-inspector.ts";
import type { EventPacket } from "../../../packets/index.ts";
import { RelayReqScheduler, type ReqRunner } from "./relay-req-scheduler.ts";

function req(source: Observable<EventPacket>, run: () => void): ReqRunner {
  return () => {
    run();

    return source;
  };
}

describe("RelayReqScheduler", () => {
  test("waits for NIP-11 capacity before starting REQs", () => {
    const scheduler = new RelayReqScheduler();
    const run = vi.fn();

    const inspector = new SubscriptionInspector<EventPacket>();

    scheduler.schedule(req(new Subject<EventPacket>(), run)).subscribe(inspector);
    expect(run).not.toHaveBeenCalled();

    scheduler.setMaxSubscriptions(undefined);
    expect(run).toHaveBeenCalledOnce();
    scheduler.dispose();
  });

  test("starts REQs in FIFO order after the previous terminal is delivered", () => {
    const scheduler = new RelayReqScheduler();

    scheduler.setMaxSubscriptions(1);
    const first = new Subject<EventPacket>();
    const second = new Subject<EventPacket>();
    const firstRun = vi.fn();
    const secondRun = vi.fn();
    const firstInspector = new SubscriptionInspector<EventPacket>();

    scheduler
      .schedule(req(first, firstRun))
      .pipe(
        tap({
          complete: () => expect(secondRun).not.toHaveBeenCalled(),
        }),
      )
      .subscribe(firstInspector);
    const secondInspector = new SubscriptionInspector<EventPacket>();

    scheduler.schedule(req(second, secondRun)).subscribe(secondInspector);

    expect(firstRun).toHaveBeenCalledOnce();
    expect(secondRun).not.toHaveBeenCalled();
    first.complete();
    expect(secondRun).toHaveBeenCalledOnce();
    expect(firstInspector.completed).toBe(true);
    scheduler.dispose();
  });

  test("tears down an errored REQ before starting the next one", () => {
    const scheduler = new RelayReqScheduler();

    scheduler.setMaxSubscriptions(1);
    const order: string[] = [];
    let fail!: (error: unknown) => void;
    const first = new Observable<EventPacket>((subscriber) => {
      fail = (error) => subscriber.error(error);

      return () => order.push("first teardown");
    });
    const error = new Error("failed");

    const firstInspector = new SubscriptionInspector<EventPacket>();

    scheduler
      .schedule(req(first, () => order.push("first run")))
      .pipe(
        tap({
          error: () => order.push("first error"),
        }),
      )
      .subscribe(firstInspector);
    const secondInspector = new SubscriptionInspector<EventPacket>();

    scheduler
      .schedule(req(new Subject<EventPacket>(), () => order.push("second run")))
      .subscribe(secondInspector);
    fail(error);

    expect(order).toEqual(["first run", "first teardown", "first error", "second run"]);
    scheduler.dispose();
  });

  test("settles a synchronously completed REQ after its teardown", () => {
    const scheduler = new RelayReqScheduler();

    scheduler.setMaxSubscriptions(1);
    const active = new Subject<EventPacket>();
    const order: string[] = [];
    const synchronous = new Observable<EventPacket>((subscriber) => {
      subscriber.complete();

      return () => order.push("synchronous teardown");
    });

    const firstInspector = new SubscriptionInspector<EventPacket>();

    scheduler.schedule(req(active, vi.fn())).subscribe(firstInspector);
    const synchronousInspector = new SubscriptionInspector<EventPacket>();

    scheduler
      .schedule(req(synchronous, () => order.push("synchronous run")))
      .pipe(tap({ complete: () => order.push("synchronous complete") }))
      .subscribe(synchronousInspector);
    const secondInspector = new SubscriptionInspector<EventPacket>();

    scheduler
      .schedule(req(new Subject<EventPacket>(), () => order.push("next run")))
      .subscribe(secondInspector);
    active.complete();

    expect(order).toEqual([
      "synchronous run",
      "synchronous teardown",
      "synchronous complete",
      "next run",
    ]);
    scheduler.dispose();
  });

  test("releases the slot when req.run throws synchronously", async () => {
    const scheduler = new RelayReqScheduler();

    scheduler.setMaxSubscriptions(1);
    const error = new Error("run failed");
    const firstInspector = new SubscriptionInspector<EventPacket>();
    const nextRun = vi.fn();

    scheduler
      .schedule(() => {
        throw error;
      })
      .subscribe(firstInspector);
    const secondInspector = new SubscriptionInspector<EventPacket>();

    scheduler.schedule(req(new Subject<EventPacket>(), nextRun)).subscribe(secondInspector);
    await expect(firstInspector.waitError()).resolves.toEqual(error);
    expect(nextRun).toHaveBeenCalledOnce();
    scheduler.dispose();
  });

  test("cancels a queued REQ without running it", () => {
    const scheduler = new RelayReqScheduler();

    scheduler.setMaxSubscriptions(1);
    const active = new Subject<EventPacket>();
    const activeRun = vi.fn();
    const queuedRun = vi.fn();

    const firstInspector = new SubscriptionInspector<EventPacket>();

    scheduler.schedule(req(active, activeRun)).subscribe(firstInspector);
    const secondInspector = new SubscriptionInspector<EventPacket>();
    const queued = scheduler
      .schedule(req(new Subject<EventPacket>(), queuedRun))
      .subscribe(secondInspector);

    queued.unsubscribe();
    active.complete();

    expect(activeRun).toHaveBeenCalledOnce();
    expect(queuedRun).not.toHaveBeenCalled();
    scheduler.dispose();
  });

  test("completes queued REQs when capacity is zero", () => {
    const scheduler = new RelayReqScheduler();

    scheduler.setMaxSubscriptions(0);
    const run = vi.fn();
    const inspector = new SubscriptionInspector<EventPacket>();

    scheduler.schedule(req(new Subject<EventPacket>(), run)).subscribe(inspector);

    expect(run).not.toHaveBeenCalled();
    expect(inspector.completed).toBe(true);
    scheduler.dispose();
  });

  test("dispose completes active and queued work and tears down the active REQ", () => {
    const scheduler = new RelayReqScheduler();

    scheduler.setMaxSubscriptions(1);
    const teardown = vi.fn();
    const activeRun = vi.fn();
    const queuedRun = vi.fn();
    const firstInspector = new SubscriptionInspector<EventPacket>();
    const secondInspector = new SubscriptionInspector<EventPacket>();
    const active = new Observable<EventPacket>(() => teardown);

    scheduler.schedule(req(active, activeRun)).subscribe(firstInspector);

    scheduler.schedule(req(new Subject<EventPacket>(), queuedRun)).subscribe(secondInspector);
    scheduler.dispose();

    expect(firstInspector.completed).toBe(true);
    expect(secondInspector.completed).toBe(true);
    expect(teardown).toHaveBeenCalledOnce();
    expect(queuedRun).not.toHaveBeenCalled();
  });
});
