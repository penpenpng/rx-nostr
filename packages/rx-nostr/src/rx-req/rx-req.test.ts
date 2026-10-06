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

test.each([NaN, -Infinity, -1, 2_147_483_648])(
  "rejects invalid packet linger without emitting: %s",
  (linger) => {
    const request = new RxReq();
    const inspector = new SubscriptionInspector<ReqPacket>();

    request.asObservable().subscribe(inspector);

    expect(() => request.emit({ kinds: [1] }, { linger })).toThrow(RangeError);
    expect(inspector.values).toEqual([]);
    request.dispose();
  },
);

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

test("a middle view ends its descendants but leaves its parent and sibling views live", async () => {
  const source = new RxReq();
  const child = source.pipe(map((packet) => packet));
  const grandchild = child.pipe(map((packet) => packet));
  const sibling = source.pipe(map((packet) => packet));
  const parentInspector = new SubscriptionInspector<ReqPacket>();
  const childInspector = new SubscriptionInspector<ReqPacket>();
  const grandchildInspector = new SubscriptionInspector<ReqPacket>();
  const detachedInspector = new SubscriptionInspector<ReqPacket>();
  const siblingInspector = new SubscriptionInspector<ReqPacket>();

  source.asObservable().subscribe(parentInspector);
  child.asObservable().subscribe(childInspector);
  grandchild.asObservable().subscribe(grandchildInspector);
  const detached = grandchild.asObservable().subscribe(detachedInspector);

  sibling.asObservable().subscribe(siblingInspector);
  detached.unsubscribe();
  source.emit({ kinds: [1] });

  expect(detachedInspector.values).toEqual([]);
  expect(childInspector.values).toEqual([{ filters: [{ kinds: [1] }] }]);
  expect(grandchildInspector.values).toEqual([{ filters: [{ kinds: [1] }] }]);
  expect(siblingInspector.values).toEqual([{ filters: [{ kinds: [1] }] }]);

  child.dispose();
  child.dispose();
  await expect(childInspector.waitComplete()).resolves.toBeUndefined();
  await expect(grandchildInspector.waitComplete()).resolves.toBeUndefined();
  expect(parentInspector.completed).toBe(false);
  expect(siblingInspector.completed).toBe(false);

  grandchild.emit({ kinds: [2] });
  source.emit({ kinds: [3] });
  expect(parentInspector.values).toEqual([
    { filters: [{ kinds: [1] }] },
    { filters: [{ kinds: [3] }] },
  ]);
  expect(siblingInspector.values).toEqual(parentInspector.values);
  expect(grandchildInspector.values).toHaveLength(1);

  const lateGrandchild = new SubscriptionInspector<ReqPacket>();

  grandchild.asObservable().subscribe(lateGrandchild);
  await expect(lateGrandchild.waitComplete()).resolves.toBeUndefined();
  source.dispose();
  await expect(parentInspector.waitComplete()).resolves.toBeUndefined();
  await expect(siblingInspector.waitComplete()).resolves.toBeUndefined();
  sibling.dispose();
  grandchild.dispose();
});

test("saved descendant streams cannot restart after an ancestor is disposed", () => {
  vi.useFakeTimers();
  const parent = new RxReq();
  const child = parent.pipe();
  const grandchild = child.pipe(delay(100));
  const sibling = parent.pipe();
  const saved = grandchild.asObservable();
  const values: ReqPacket[] = [];
  const siblingValues: ReqPacket[] = [];
  const siblingSub = sibling.asObservable().subscribe((packet) => siblingValues.push(packet));
  const first = saved.subscribe((packet) => values.push(packet));

  try {
    parent.emit({ kinds: [1] });
    child.dispose();
    expect(first.closed).toBe(true);
    const late = saved.subscribe((packet) => values.push(packet));

    expect(late.closed).toBe(true);
    parent.emit({ kinds: [2] });
    vi.advanceTimersByTime(100);
    expect(values).toEqual([]);
    expect(siblingValues).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    first.unsubscribe();
    siblingSub.unsubscribe();
    parent.dispose();
    grandchild.dispose();
    sibling.dispose();
    vi.useRealTimers();
  }
});
