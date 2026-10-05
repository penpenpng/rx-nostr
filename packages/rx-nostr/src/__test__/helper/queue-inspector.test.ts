import { afterEach, expect, test, vi } from "vitest";

import { QueueInspector, QueueInspectorTimeoutError } from "./queue-inspector.ts";

afterEach(() => vi.useRealTimers());

test("reports the awaited position and the receive count at timeout", async () => {
  vi.useFakeTimers();
  const queue = new QueueInspector<number>("WebSocket inbox (wss://relay.example.com)", 100);

  queue.push(1);
  queue.ignoreNexts(2);
  const pending = queue.waitNext();
  const error = pending.catch((error: unknown) => error);

  queue.push(2);
  await vi.advanceTimersByTimeAsync(100);

  await expect(error).resolves.toBeInstanceOf(QueueInspectorTimeoutError);
  await expect(error).resolves.toMatchObject({
    queueName: "WebSocket inbox (wss://relay.example.com)",
    index: 2,
    timeout: 100,
    receivedCount: 2,
    message:
      "WebSocket inbox (wss://relay.example.com): timed out after 100ms waiting for item 3 (2 received).",
    stack: expect.stringContaining("queue-inspector.test.ts"),
  });
});

test("uses a default name when none is supplied", async () => {
  vi.useFakeTimers();
  const queue = new QueueInspector<number>();
  const failure = expect(queue.waitNext()).rejects.toMatchObject({
    name: "QueueInspectorTimeoutError",
    queueName: "QueueInspector",
    index: 0,
    receivedCount: 0,
  });

  await vi.advanceTimersByTimeAsync(100);
  await failure;
});

test("settles shared waits and clears their timeout when a value arrives", async () => {
  vi.useFakeTimers();
  const queue = new QueueInspector<string>("messages");
  const first = queue.waitNext();
  const samePosition = queue.wait(0);

  expect(samePosition).toBe(first);
  queue.push("first");
  await expect(first).resolves.toBe("first");
  expect(vi.getTimerCount()).toBe(0);
  queue.push("second");
  await expect(queue.waitNext()).resolves.toBe("second");
  expect(queue.length).toBe(2);
});

test("can inspect a late value after an earlier wait timed out", async () => {
  vi.useFakeTimers();
  const queue = new QueueInspector<string>("messages");
  const failure = expect(queue.wait(0)).rejects.toBeInstanceOf(QueueInspectorTimeoutError);

  await vi.advanceTimersByTimeAsync(100);
  await failure;
  queue.push("late");
  await expect(queue.wait(0)).resolves.toBe("late");
  expect(vi.getTimerCount()).toBe(0);
});
