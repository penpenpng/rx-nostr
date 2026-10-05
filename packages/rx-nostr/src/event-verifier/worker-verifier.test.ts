import { afterEach, describe, expect, test, vi } from "vitest";

import { Faker } from "../__test__/helper/faker.ts";
import { VerificationClient } from "./worker-verifier.ts";

function controlledWorker() {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const addEventListener = vi.fn((type: string, listener: (event: unknown) => void) => {
    const handlers = listeners.get(type) ?? new Set();

    handlers.add(listener);
    listeners.set(type, handlers);
  });
  const removeEventListener = vi.fn((type: string, listener: (event: unknown) => void) => {
    listeners.get(type)?.delete(listener);
  });
  const postMessage = vi.fn();
  const terminate = vi.fn();

  return {
    worker: { addEventListener, removeEventListener, postMessage, terminate } as unknown as Worker,
    postMessage,
    terminate,
    listeners,
    emit(type: string, data?: unknown) {
      for (const listener of listeners.get(type) ?? []) {
        listener(type === "message" ? { data } : { type });
      }
    },
  };
}

afterEach(() => vi.useRealTimers());

describe("VerificationClient pending requests", () => {
  test("dispose rejects every request immediately and releases the worker and timer", async () => {
    vi.useFakeTimers();
    const controlled = controlledWorker();
    const client = new VerificationClient({ worker: controlled.worker, timeout: 1_000 });

    client.start();
    controlled.emit("message", "pong");

    const first = client.verifyEvent(Faker.event({ id: "first" })).then(
      () => "resolved",
      (error: unknown) => error,
    );
    const second = client.verifyEvent(Faker.event({ id: "second" })).then(
      () => "resolved",
      (error: unknown) => error,
    );

    client.dispose();

    await expect(first).resolves.toMatchObject({ message: "VerificationClient was disposed." });
    await expect(second).resolves.toMatchObject({ message: "VerificationClient was disposed." });
    expect(controlled.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect([...controlled.listeners.values()].every((handlers) => handlers.size === 0)).toBe(true);

    controlled.emit("message", { reqId: 1, ok: true });
    controlled.emit("message", "pong");
    client.dispose();
    expect(client.status).toBe("terminated");
    expect(() => client.verifyEvent(Faker.event())).toThrow("disposed");
  });

  test("a response before dispose settles once while a late response is ignored", async () => {
    const controlled = controlledWorker();
    const client = new VerificationClient({ worker: controlled.worker });

    client.start();
    controlled.emit("message", "pong");
    const accepted = client.verifyEvent(Faker.event({ id: "accepted" }));
    const rejected = client.verifyEvent(Faker.event({ id: "pending" })).then(
      () => "resolved",
      (error: unknown) => error,
    );

    controlled.emit("message", { reqId: 1, ok: true });
    client.dispose();
    controlled.emit("message", { reqId: 2, ok: true });

    await expect(accepted).resolves.toBe(true);
    await expect(rejected).resolves.toMatchObject({ message: "VerificationClient was disposed." });
  });

  test.each(["error", "messageerror"] as const)(
    "%s rejects pending calls and preserves fallback for new calls",
    async (type) => {
      const controlled = controlledWorker();
      const fallback = { verifyEvent: vi.fn(async () => true) };
      const client = new VerificationClient({ worker: controlled.worker, fallback });

      client.start();
      controlled.emit("message", "pong");
      const pending = client.verifyEvent(Faker.event()).then(
        () => "resolved",
        (error: unknown) => error,
      );

      controlled.emit(type);
      await expect(pending).resolves.toMatchObject({ message: "Verification worker failed." });
      await expect(client.verifyEvent(Faker.event())).resolves.toBe(true);
      client.dispose();
    },
  );

  test("a synchronous postMessage failure rejects the request", async () => {
    const controlled = controlledWorker();
    const fallback = { verifyEvent: vi.fn(async () => true) };
    const client = new VerificationClient({ worker: controlled.worker, fallback });

    client.start();
    controlled.emit("message", "pong");
    const cause = new Error("cannot clone event");

    controlled.postMessage.mockImplementationOnce(() => {
      throw cause;
    });

    await expect(client.verifyEvent(Faker.event())).rejects.toBe(cause);
    await expect(client.verifyEvent(Faker.event())).resolves.toBe(true);
    client.dispose();
  });
});
