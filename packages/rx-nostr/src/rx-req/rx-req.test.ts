import "disposablestack/auto";
import { delay, filter, map } from "rxjs";
import { expect, test, vi } from "vitest";

import { SubscriptionInspector } from "../__test__/helper/index.ts";
import type { ReqPacket } from "../packets/index.ts";
import { RxReq } from "./rx-req.ts";

test("RxReq emits a filter", async () => {
  const rxq = new RxReq();
  const observable = rxq.asObservable();
  const inspector = new SubscriptionInspector<ReqPacket>();

  observable.subscribe(inspector);

  rxq.emit({ kinds: [0] });

  await expect(inspector.waitNext()).resolves.toEqual({ filters: [{ kinds: [0] }] });
});

test("Piped RxReq emits a filter", async () => {
  const rxq = new RxReq();
  const observable = rxq.pipe(filter((_, idx) => idx % 2 === 0)).asObservable();
  const inspector = new SubscriptionInspector<ReqPacket>();

  observable.subscribe(inspector);

  rxq.emit({ kinds: [0] });
  await expect(inspector.waitNext()).resolves.toEqual({ filters: [{ kinds: [0] }] });
  rxq.emit({ kinds: [1] });
  rxq.emit({ kinds: [2] });

  await expect(inspector.waitNext()).resolves.toEqual({ filters: [{ kinds: [2] }] });
});

test("Extended RxReq emits a filter", async () => {
  class RxCustomReq extends RxReq {
    fetchByKind(kind: number) {
      this.emit({ kinds: [kind] });
    }
  }

  const rxq = new RxCustomReq();
  const observable = rxq.pipe(filter((_, idx) => idx % 2 === 0)).asObservable();
  const inspector = new SubscriptionInspector<ReqPacket>();

  observable.subscribe(inspector);

  rxq.fetchByKind(0);
  await expect(inspector.waitNext()).resolves.toEqual({ filters: [{ kinds: [0] }] });
  rxq.fetchByKind(1);
  rxq.fetchByKind(2);

  await expect(inspector.waitNext()).resolves.toEqual({ filters: [{ kinds: [2] }] });
});

test("disposing one derived RxReq completes only that view", async () => {
  const source = new RxReq();
  const first = source.pipe(map((packet) => packet));
  const second = source.pipe(map((packet) => packet));
  const parentInspector = new SubscriptionInspector<ReqPacket>();
  const firstInspector = new SubscriptionInspector<ReqPacket>();
  const firstPeerInspector = new SubscriptionInspector<ReqPacket>();
  const secondInspector = new SubscriptionInspector<ReqPacket>();

  source.asObservable().subscribe(parentInspector);
  first.asObservable().subscribe(firstInspector);
  first.asObservable().subscribe(firstPeerInspector);
  second.asObservable().subscribe(secondInspector);

  source.emit({ kinds: [1] });
  await expect(firstInspector.waitNext()).resolves.toEqual({ filters: [{ kinds: [1] }] });

  first.dispose();
  await expect(firstInspector.waitComplete()).resolves.toBeUndefined();
  await expect(firstPeerInspector.waitComplete()).resolves.toBeUndefined();

  first.emit({ kinds: [2] });
  second.emit({ kinds: [3] });

  await expect(parentInspector.waitNext()).resolves.toEqual({ filters: [{ kinds: [1] }] });
  await expect(parentInspector.waitNext()).resolves.toEqual({ filters: [{ kinds: [3] }] });
  await expect(secondInspector.waitNext()).resolves.toEqual({ filters: [{ kinds: [1] }] });
  await expect(secondInspector.waitNext()).resolves.toEqual({ filters: [{ kinds: [3] }] });
  expect(firstInspector.values).toHaveLength(1);

  const late = new SubscriptionInspector<ReqPacket>();

  first.asObservable().subscribe(late);
  await expect(late.waitComplete()).resolves.toBeUndefined();
  expect(late.values).toEqual([]);

  source.dispose();
  await expect(parentInspector.waitComplete()).resolves.toBeUndefined();
  await expect(secondInspector.waitComplete()).resolves.toBeUndefined();
});

test("disposing a derived RxReq cancels delayed operator work", async () => {
  vi.useFakeTimers();

  try {
    const source = new RxReq();
    const derived = source.pipe(delay(100));
    const inspector = new SubscriptionInspector<ReqPacket>();

    derived.asObservable().subscribe(inspector);
    source.emit({ kinds: [1] });
    derived.dispose();

    await expect(inspector.waitComplete()).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(100);
    expect(inspector.values).toEqual([]);
    source.dispose();
  } finally {
    vi.useRealTimers();
  }
});

test("parent disposal tears down delayed output in multi-level derived RxReqs", async () => {
  vi.useFakeTimers();

  try {
    const source = new RxReq();
    const child = source.pipe(delay(100));
    const grandchild = child.pipe(map((packet) => packet));
    const childInspector = new SubscriptionInspector<ReqPacket>();
    const grandchildInspector = new SubscriptionInspector<ReqPacket>();

    child.asObservable().subscribe(childInspector);
    grandchild.asObservable().subscribe(grandchildInspector);
    source.emit({ kinds: [1] });
    source.dispose();

    await expect(childInspector.waitComplete()).resolves.toBeUndefined();
    await expect(grandchildInspector.waitComplete()).resolves.toBeUndefined();
    vi.advanceTimersByTime(100);
    expect(childInspector.values).toEqual([]);
    expect(grandchildInspector.values).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);

    child.dispose();
    grandchild.dispose();
  } finally {
    vi.useRealTimers();
  }
});
