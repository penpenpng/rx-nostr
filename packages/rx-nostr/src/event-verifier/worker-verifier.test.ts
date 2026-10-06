import { VerificationClient, VerificationHost } from "rx-nostr";
import { afterEach, describe, expect, test, vi } from "vitest";

import { Faker } from "../__test__/helper/faker.ts";

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

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("VerificationClient pending requests", () => {
  test("uses fallback during booting and error without reviving after a late pong", async () => {
    const controlled = controlledWorker();
    const fallback = { verifyEvent: vi.fn(async () => false) };
    const client = new VerificationClient({ worker: controlled.worker, fallback });

    expect(client.status).toBe("prepared");
    expect(() => client.verifyEvent(Faker.event())).toThrow("not started");
    client.start();
    expect(client.status).toBe("booting");
    await expect(client.verifyEvent(Faker.event())).resolves.toBe(false);

    controlled.emit("message", "pong");
    expect(client.status).toBe("active");
    controlled.emit("error");
    expect(client.status).toBe("error");
    controlled.emit("message", "pong");
    expect(client.status).toBe("error");
    await expect(client.verifyEvent(Faker.event())).resolves.toBe(false);
    client.dispose();
    expect(client.status).toBe("terminated");
  });

  test("enters fallback state if the startup ping cannot be posted", async () => {
    const controlled = controlledWorker();
    const fallback = { verifyEvent: vi.fn(async () => true) };
    const client = new VerificationClient({ worker: controlled.worker, fallback });

    controlled.postMessage.mockImplementationOnce(() => {
      throw new Error("startup post failed");
    });

    expect(() => client.start()).not.toThrow();
    expect(client.status).toBe("error");
    await expect(client.verifyEvent(Faker.event())).resolves.toBe(true);
    client.dispose();
  });

  test("ignores malformed messages without disturbing an unrelated pending request", async () => {
    const controlled = controlledWorker();
    const client = new VerificationClient({ worker: controlled.worker });

    client.start();
    controlled.emit("message", "pong");
    const pending = client.verifyEvent(Faker.event());

    expect(() => controlled.emit("message", null)).not.toThrow();
    expect(() => controlled.emit("message", 42)).not.toThrow();
    controlled.emit("message", { reqId: 1, ok: true });
    await expect(pending).resolves.toBe(true);
    client.dispose();
  });

  test("distinguishes a valid false result from a Worker error", async () => {
    const controlled = controlledWorker();
    const client = new VerificationClient({ worker: controlled.worker });

    client.start();
    controlled.emit("message", "pong");

    const invalid = client.verifyEvent(Faker.event({ id: "invalid" }));
    const failed = client.verifyEvent(Faker.event({ id: "failed" }));
    const observedFailure = failed.then(
      () => "resolved",
      (error: unknown) => error,
    );

    controlled.emit("message", { reqId: 999, ok: true });
    controlled.emit("message", { reqId: 1, ok: false });
    controlled.emit("message", { reqId: 1, ok: true });
    controlled.emit("message", { reqId: 2, ok: false, error: "Error: verifier crashed" });

    await expect(invalid).resolves.toBe(false);
    await expect(observedFailure).resolves.toMatchObject({ message: "Error: verifier crashed" });
    client.dispose();
  });

  test.each([0, 37])("times out exactly 100ms after a request started at +%ims", async (offset) => {
    vi.useFakeTimers();
    const controlled = controlledWorker();
    const client = new VerificationClient({ worker: controlled.worker, timeout: 100 });

    client.start();
    controlled.emit("message", "pong");
    vi.advanceTimersByTime(offset);

    let settled = false;
    const result = client.verifyEvent(Faker.event()).then(
      () => {
        settled = true;

        return "resolved";
      },
      (error: unknown) => {
        settled = true;

        return error;
      },
    );

    vi.advanceTimersByTime(99);
    await Promise.resolve();
    expect(settled).toBe(false);

    vi.advanceTimersByTime(1);
    await expect(result).resolves.toMatchObject({ message: "Verification request was timed out." });
    expect(vi.getTimerCount()).toBe(0);
    client.dispose();
  });

  test("independent requests have independent deadlines", async () => {
    vi.useFakeTimers();
    const controlled = controlledWorker();
    const client = new VerificationClient({ worker: controlled.worker, timeout: 100 });

    client.start();
    controlled.emit("message", "pong");

    const first = client.verifyEvent(Faker.event()).then(
      () => "resolved",
      (error: unknown) => error,
    );

    vi.advanceTimersByTime(50);
    const second = client.verifyEvent(Faker.event()).then(
      () => "resolved",
      (error: unknown) => error,
    );
    let secondSettled = false;

    void second.then(() => {
      secondSettled = true;
    });

    vi.advanceTimersByTime(50);
    await expect(first).resolves.toMatchObject({ message: "Verification request was timed out." });
    expect(secondSettled).toBe(false);

    vi.advanceTimersByTime(50);
    await expect(second).resolves.toMatchObject({ message: "Verification request was timed out." });
    expect(vi.getTimerCount()).toBe(0);
    client.dispose();
  });

  test("a response at the deadline settles once and cancels its timer", async () => {
    vi.useFakeTimers();
    const controlled = controlledWorker();
    const client = new VerificationClient({ worker: controlled.worker, timeout: 100 });

    client.start();
    controlled.emit("message", "pong");
    const result = client.verifyEvent(Faker.event());

    vi.advanceTimersByTime(99);
    controlled.emit("message", { reqId: 1, ok: true });
    vi.advanceTimersByTime(1);

    await expect(result).resolves.toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    client.dispose();
  });

  test("zero is immediate, Infinity disables deadlines, and invalid durations reject", async () => {
    vi.useFakeTimers();

    for (const invalid of [-1, NaN, -Infinity, 2_147_483_648]) {
      expect(
        () => new VerificationClient({ worker: controlledWorker().worker, timeout: invalid }),
      ).toThrow(RangeError);
    }

    const zeroWorker = controlledWorker();
    const zero = new VerificationClient({ worker: zeroWorker.worker, timeout: 0 });

    zero.start();
    zeroWorker.emit("message", "pong");
    const immediate = zero.verifyEvent(Faker.event()).then(
      () => "resolved",
      (error: unknown) => error,
    );

    vi.advanceTimersByTime(0);
    await expect(immediate).resolves.toMatchObject({
      message: "Verification request was timed out.",
    });
    zero.dispose();

    const infiniteWorker = controlledWorker();
    const infinite = new VerificationClient({ worker: infiniteWorker.worker, timeout: Infinity });

    infinite.start();
    infiniteWorker.emit("message", "pong");
    const pending = infinite.verifyEvent(Faker.event()).then(
      () => "resolved",
      (error: unknown) => error,
    );

    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1_000_000);
    infinite.dispose();
    await expect(pending).resolves.toMatchObject({ message: "VerificationClient was disposed." });
  });

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

describe("VerificationHost responses", () => {
  test("connects the public Host and Client protocol for concurrent results and errors", async () => {
    vi.useFakeTimers();
    const controlled = controlledWorker();

    class WorkerContext {
      handlers = new Set<(event: MessageEvent) => void>();
      addEventListener(_type: string, handler: (event: MessageEvent) => void) {
        this.handlers.add(handler);
      }
      removeEventListener(_type: string, handler: (event: MessageEvent) => void) {
        this.handlers.delete(handler);
      }
      postMessage(data: unknown) {
        controlled.emit("message", data);
      }
      dispatch(data: unknown) {
        for (const handler of this.handlers) {
          handler({ data } as MessageEvent);
        }
      }
    }

    const scope = new WorkerContext();

    vi.stubGlobal("WorkerGlobalScope", WorkerContext);
    vi.stubGlobal("self", scope);
    controlled.postMessage.mockImplementation((data: unknown) => scope.dispatch(data));

    const verifyEvent = vi.fn(async (event: ReturnType<typeof Faker.event>) => {
      if (event.id === "crash") {
        throw new Error("verifier failed");
      }

      return event.id === "valid";
    });
    const host = new VerificationHost({ verifyEvent });
    const client = new VerificationClient({ worker: controlled.worker, timeout: 100 });

    expect(() => host.start()).not.toThrow();
    client.start();
    expect(client.status).toBe("active");
    const valid = client.verifyEvent(Faker.event({ id: "valid" }));
    const invalid = client.verifyEvent(Faker.event({ id: "invalid" }));
    const crashed = client.verifyEvent(Faker.event({ id: "crash" }));

    controlled.emit("message", { reqId: 999, ok: true });
    await expect(valid).resolves.toBe(true);
    await expect(invalid).resolves.toBe(false);
    await expect(crashed).rejects.toThrow("verifier failed");
    controlled.emit("message", { reqId: 1, ok: false });
    expect(vi.getTimerCount()).toBe(0);

    host.dispose();
    client.dispose();
    expect(scope.handlers.size).toBe(0);
    expect([...controlled.listeners.values()].every((handlers) => handlers.size === 0)).toBe(true);
  });

  test("requires a Worker context for start and dispose", () => {
    const host = new VerificationHost({ verifyEvent: vi.fn(async () => true) });

    expect(() => host.start()).toThrow("Worker context");
    expect(() => host.dispose()).toThrow("Worker context");
  });

  test("sends false as a result and verifier exceptions as error responses", async () => {
    class WorkerContext {
      handler?: (event: MessageEvent) => Promise<void>;
      postMessage = vi.fn();
      addEventListener(_type: string, listener: (event: MessageEvent) => Promise<void>) {
        this.handler = listener;
      }
      removeEventListener = vi.fn(() => {
        this.handler = undefined;
      });
      async request(reqId: number) {
        await this.handler?.({ data: { reqId, event: Faker.event() } } as MessageEvent);
      }
    }

    const scope = new WorkerContext();

    vi.stubGlobal("WorkerGlobalScope", WorkerContext);
    vi.stubGlobal("self", scope);

    const verifyEvent = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error("broken"))
      .mockRejectedValueOnce("string failure")
      .mockRejectedValueOnce({
        toString() {
          throw new Error("unsafe stringification");
        },
      });
    const host = new VerificationHost({ verifyEvent });

    host.start();
    await scope.request(1);
    await scope.request(2);
    await scope.request(3);
    await scope.request(4);

    expect(scope.postMessage.mock.calls.map(([message]) => message)).toEqual([
      { reqId: 1, ok: false },
      { reqId: 2, ok: false, error: "Error: broken" },
      { reqId: 3, ok: false, error: "string failure" },
      { reqId: 4, ok: false, error: "Worker verification failed." },
    ]);
    host.dispose();
    expect(scope.handler).toBeUndefined();
  });
});

describe.each(["booting", "error"] as const)("fallback while %s", (status) => {
  function setup(timeout = 100) {
    const controlled = controlledWorker();
    const deferred = Promise.withResolvers<boolean>();
    const fallback = { verifyEvent: vi.fn(() => deferred.promise) };
    const client = new VerificationClient({ worker: controlled.worker, fallback, timeout });

    client.start();

    if (status === "error") {
      controlled.emit("error");
    }

    return { controlled, deferred, client };
  }

  test("times out at the deadline and ignores a late fallback result", async () => {
    vi.useFakeTimers();
    const { client, deferred } = setup();
    const rejected = expect(client.verifyEvent(Faker.event())).rejects.toThrow("timed out");

    try {
      await vi.advanceTimersByTimeAsync(99);
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      await rejected;
      deferred.resolve(true);
      await Promise.resolve();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      client.dispose();
    }
  });

  test.each([100, Infinity])(
    "dispose rejects pending fallback with timeout %s",
    async (timeout) => {
      vi.useFakeTimers();
      const { client, deferred } = setup(timeout);
      const rejected = expect(client.verifyEvent(Faker.event())).rejects.toThrow("disposed");

      client.dispose();
      await rejected;
      expect(vi.getTimerCount()).toBe(0);
      deferred.reject(new Error("late fallback failure"));
      await Promise.resolve();
    },
  );

  test.each([true, false])(
    "settles fallback %s before the deadline and clears its timer",
    async (ok) => {
      vi.useFakeTimers();
      const { client, controlled, deferred } = setup();
      const pending = client.verifyEvent(Faker.event());

      try {
        // Worker messages and errors must not settle a fallback request.
        controlled.emit("message", { reqId: 1, ok: !ok });
        controlled.emit("error");
        await vi.advanceTimersByTimeAsync(99);
        deferred.resolve(ok);
        await expect(pending).resolves.toBe(ok);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        client.dispose();
      }
    },
  );

  test.each(["throw", "reject"] as const)(
    "propagates a fallback %s and clears its timer",
    async (mode) => {
      vi.useFakeTimers();
      const controlled = controlledWorker();
      const error = new Error("fallback failed");
      const client = new VerificationClient({
        worker: controlled.worker,
        fallback: {
          verifyEvent: () => {
            if (mode === "throw") {
              throw error;
            }

            return Promise.reject(error);
          },
        },
      });

      client.start();

      if (status === "error") {
        controlled.emit("error");
      }

      try {
        await expect(client.verifyEvent(Faker.event())).rejects.toBe(error);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        client.dispose();
      }
    },
  );

  test("zero timeout releases the fallback request", async () => {
    vi.useFakeTimers();
    const { client, deferred } = setup(0);
    const rejected = expect(client.verifyEvent(Faker.event())).rejects.toThrow("timed out");

    await vi.advanceTimersByTimeAsync(0);
    await rejected;
    deferred.resolve(false);
    client.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
