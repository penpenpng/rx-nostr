import { Observable, Subject } from "rxjs";
import { describe, expect, test, vi } from "vitest";
import type { EventPacket } from "../packets/index.ts";
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

    scheduler.schedule(req(new Subject<EventPacket>(), run)).subscribe();
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
    const firstComplete = vi.fn(() => expect(secondRun).not.toHaveBeenCalled());

    scheduler.schedule(req(first, firstRun)).subscribe({
      complete: firstComplete,
    });
    scheduler.schedule(req(second, secondRun)).subscribe();

    expect(firstRun).toHaveBeenCalledOnce();
    expect(secondRun).not.toHaveBeenCalled();
    first.complete();
    expect(secondRun).toHaveBeenCalledOnce();
    expect(firstComplete).toHaveBeenCalledOnce();
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

    scheduler.schedule(req(first, () => order.push("first run"))).subscribe({
      error: () => order.push("first error"),
    });
    scheduler.schedule(req(new Subject<EventPacket>(), () => order.push("second run"))).subscribe();
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

    scheduler.schedule(req(active, vi.fn())).subscribe();
    scheduler
      .schedule(req(synchronous, () => order.push("synchronous run")))
      .subscribe({ complete: () => order.push("synchronous complete") });
    scheduler.schedule(req(new Subject<EventPacket>(), () => order.push("next run"))).subscribe();
    active.complete();

    expect(order).toEqual([
      "synchronous run",
      "synchronous teardown",
      "synchronous complete",
      "next run",
    ]);
    scheduler.dispose();
  });

  test("releases the slot when req.run throws synchronously", () => {
    const scheduler = new RelayReqScheduler();
    scheduler.setMaxSubscriptions(1);
    const error = new Error("run failed");
    const received = vi.fn();
    const nextRun = vi.fn();

    scheduler
      .schedule(() => {
        throw error;
      })
      .subscribe({ error: received });
    scheduler.schedule(req(new Subject<EventPacket>(), nextRun)).subscribe();

    expect(received).toHaveBeenCalledOnce();
    expect(received).toHaveBeenCalledWith(error);
    expect(nextRun).toHaveBeenCalledOnce();
    scheduler.dispose();
  });

  test("cancels a queued REQ without running it", () => {
    const scheduler = new RelayReqScheduler();
    scheduler.setMaxSubscriptions(1);
    const active = new Subject<EventPacket>();
    const activeRun = vi.fn();
    const queuedRun = vi.fn();

    scheduler.schedule(req(active, activeRun)).subscribe();
    const queued = scheduler.schedule(req(new Subject<EventPacket>(), queuedRun)).subscribe();
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
    const complete = vi.fn();

    scheduler.schedule(req(new Subject<EventPacket>(), run)).subscribe({ complete });

    expect(run).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledOnce();
    scheduler.dispose();
  });

  test("dispose completes active and queued work and tears down the active REQ", () => {
    const scheduler = new RelayReqScheduler();
    scheduler.setMaxSubscriptions(1);
    const teardown = vi.fn();
    const activeRun = vi.fn();
    const queuedRun = vi.fn();
    const activeComplete = vi.fn();
    const queuedComplete = vi.fn();
    const active = new Observable<EventPacket>(() => teardown);

    scheduler.schedule(req(active, activeRun)).subscribe({
      complete: activeComplete,
    });
    scheduler
      .schedule(req(new Subject<EventPacket>(), queuedRun))
      .subscribe({ complete: queuedComplete });
    scheduler.dispose();

    expect(activeComplete).toHaveBeenCalledOnce();
    expect(queuedComplete).toHaveBeenCalledOnce();
    expect(teardown).toHaveBeenCalledOnce();
    expect(queuedRun).not.toHaveBeenCalled();
  });
});
