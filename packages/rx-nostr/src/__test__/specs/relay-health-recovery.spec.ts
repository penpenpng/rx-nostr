import {
  NoopVerifier,
  RelayDirectory,
  RxNostr,
  type ConnectionState,
  type RelayHealthPolicy,
  type RelaySuppressionStrategy,
  type RelaySuppressionContext,
} from "rx-nostr";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ControlledWebSocketServer, Faker } from "../helper/index.ts";
import { settleProtocol } from "../helper/protocol-scenario.ts";

const relay = "wss://health.example.com";
const policy: RelayHealthPolicy = {
  minFailures: 2,
  minFailureDuration: 100,
  initialRetryDelay: 100,
  maxRetryDelay: 1_000,
};

class Target {
  visibilityState = "visible";
  listeners = new Map<string, Set<(event: { type: string }) => void>>();
  addEventListener(type: string, listener: (event: { type: string }) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }

    this.listeners.get(type)!.add(listener);
  }
  removeEventListener(type: string, listener: (event: { type: string }) => void) {
    this.listeners.get(type)?.delete(listener);
  }
  emit(type: string) {
    const listeners = [...(this.listeners.get(type) ?? [])];

    for (const listener of listeners) {
      listener({ type });
    }
  }
  get size() {
    return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0);
  }
}

function downDirectory() {
  const directory = new RelayDirectory();

  directory.importSnapshot(
    JSON.stringify({
      version: 1,
      relays: [{ url: relay, firstFailureAt: 0, lastFailureAt: 100, consecutiveFailures: 2 }],
    }),
  );

  return directory;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("relay health recovery public contract", () => {
  test("default backoff respects a relay health suppression deadline", async () => {
    vi.useFakeTimers();
    const server = new ControlledWebSocketServer();
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      WebSocket: server.WebSocket,
      skipFetchNip11: true,
      reconnector: RxNostr.defaultConfig.reconnector,
      relayHealthPolicy: {
        minFailures: 2,
        minFailureDuration: 1,
        initialRetryDelay: 2_000,
        maxRetryDelay: 2_000,
      },
    });
    const states: ConnectionState[] = [];

    try {
      rxNostr.monitorConnectionState().subscribe(({ state }) => states.push(state));
      rxNostr.setHotRelays(relay);
      const first = server.sockets.latest;

      first.open();
      first.peerClose(1006, "offline");
      await settleProtocol();
      expect(states.at(-1)).toMatchObject({
        state: "waiting-for-connection",
        suppressionReasons: [{ category: "retry-backoff" }],
      });

      await vi.advanceTimersByTimeAsync(1_200);
      expect(server.connections).toHaveLength(2);
      server.sockets.latest.peerClose(1006, "still offline");
      await settleProtocol();
      expect(states.at(-1)).toMatchObject({
        state: "waiting-for-connection",
        suppressionReasons: expect.arrayContaining([
          expect.objectContaining({ category: "relay-health" }),
        ]),
      });

      await vi.advanceTimersByTimeAsync(799);
      expect(server.connections).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1_601);
      expect(server.connections).toHaveLength(3);
    } finally {
      rxNostr.dispose();

      for (const socket of server.connections) {
        socket.acknowledgeClose();
      }

      await settleProtocol();
      vi.useRealTimers();
    }
  });

  test.each(["cancel", "exhaust"] as const)(
    "honors %s before waiting for health suppression",
    async (action) => {
      vi.useFakeTimers();
      vi.setSystemTime(100);
      const directory = downDirectory();
      const server = new ControlledWebSocketServer();
      const reconnect = vi.fn(() => ({ action }));
      const rxNostr = new RxNostr({
        verifier: new NoopVerifier(),
        WebSocket: server.WebSocket,
        relayDirectory: directory,
        relayHealthPolicy: policy,
        skipFetchNip11: true,
        reconnector: { reconnect },
      });
      const states: ConnectionState[] = [];

      rxNostr.monitorConnectionState().subscribe((packet) => states.push(packet.state));
      rxNostr.setHotRelays(relay);
      await vi.advanceTimersByTimeAsync(100);
      server.sockets.latest.peerClose(1006, "still down");
      await vi.advanceTimersByTimeAsync(0);
      expect(reconnect).toHaveBeenCalledOnce();
      expect(states.at(-1)).toMatchObject({ state: "failed" });
      expect(server.connections.length).toBe(1);
      expect(directory.forget(relay)).toBe(true);
      rxNostr.dispose();
      await vi.advanceTimersByTimeAsync(0);
    },
  );

  test("uses a custom strategy for initial admission, recovery, and shared probes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100);
    const contexts: RelaySuppressionContext[] = [];

    class FixedSuppression implements RelaySuppressionStrategy {
      #delay = 200;
      getSuppression(context: RelaySuppressionContext) {
        contexts.push(context);
        const { health } = context;

        if (health.consecutiveFailures < 2 || health.lastFailureAt === undefined) {
          return;
        }

        return {
          suppressedUntil: health.lastFailureAt + this.#delay,
        };
      }
    }
    const server = new ControlledWebSocketServer();
    const config = {
      verifier: new NoopVerifier(),
      WebSocket: server.WebSocket,
      relayDirectory: downDirectory(),
      relayHealthPolicy: new FixedSuppression(),
      skipFetchNip11: true,
      reconnector: { reconnect: () => ({ action: "retry", delay: 0 }) as const },
    };
    const first = new RxNostr(config);
    const second = new RxNostr(config);
    const states: ConnectionState[] = [];

    first.monitorConnectionState().subscribe((packet) => states.push(packet.state));
    first.setHotRelays(relay);
    second.setHotRelays(relay);
    expect(states.at(-1)).toMatchObject({ state: "waiting-for-connection" });
    expect(states.at(-1)).toMatchObject({ suppressionReasons: [{ category: "relay-health" }] });
    await vi.advanceTimersByTimeAsync(199);
    expect(server.connections.length).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(server.connections.length).toBe(1);
    server.sockets.latest.peerClose(1006, "still down");
    await vi.advanceTimersByTimeAsync(0);
    expect(states.at(-1)).toMatchObject({ state: "waiting-for-connection" });
    await vi.advanceTimersByTimeAsync(200);
    expect(server.connections.length).toBe(2);
    server.sockets.latest.open();
    await vi.advanceTimersByTimeAsync(0);
    expect(server.connections.length).toBe(3);
    server.sockets.latest.open();
    await vi.advanceTimersByTimeAsync(0);
    expect(
      contexts.every(
        (context) =>
          context.relay === relay && context.now >= 100 && Object.isFrozen(context.health),
      ),
    ).toBe(true);
    first.dispose();
    second.dispose();

    for (const socket of server.connections) {
      socket.acknowledgeClose();
    }

    await vi.advanceTimersByTimeAsync(0);
  });

  test("suppresses the first connection and retries an active forward without new demand", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100);
    const server = new ControlledWebSocketServer();
    const directory = downDirectory();
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      WebSocket: server.WebSocket,
      relayDirectory: directory,
      relayHealthPolicy: policy,
      skipFetchNip11: true,
      reconnector: { reconnect: () => ({ action: "retry", delay: 0 }) },
    });
    const states: ConnectionState[] = [];

    rxNostr.monitorConnectionState().subscribe((packet) => states.push(packet.state));
    const events: string[] = [];
    const subscription = rxNostr
      .forward(relay, [{ kinds: [1] }], { timeout: Infinity, linger: 0 })
      .subscribe((packet) => events.push(packet.event.id));

    expect(server.connections.length).toBe(0);
    expect(states.at(-1)).toMatchObject({
      state: "waiting-for-connection",
      suppressionReasons: [{ category: "relay-health", kind: "relay-health" }],
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(server.connections.length).toBe(1);
    server.sockets.latest.peerClose(1006, "still down");
    await vi.advanceTimersByTimeAsync(0);
    expect(states.at(-1)).toMatchObject({
      state: "waiting-for-connection",
      suppressionReasons: [{ category: "relay-health", kind: "relay-health" }],
    });
    await vi.advanceTimersByTimeAsync(199);
    expect(server.connections.length).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    const socket = server.sockets.latest;

    socket.open();
    await vi.advanceTimersByTimeAsync(0);
    const req = await socket.inbox.waitNext("REQ");

    socket.message(["EVENT", req[1], Faker.event({ id: "recovered", kind: 1 })]);
    await vi.advanceTimersByTimeAsync(0);
    expect(events).toEqual(["recovered"]);
    expect(subscription.closed).toBe(false);
    expect(directory.get(relay)).toMatchObject({ consecutiveFailures: 0 });
    expect(directory.get(relay)?.firstFailureAt).toBeUndefined();
    subscription.unsubscribe();
    rxNostr.dispose();
    socket.acknowledgeClose();
    await vi.advanceTimersByTimeAsync(0);
  });

  test("a shared Directory success releases another instance's suppression", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100);
    const directory = downDirectory();
    const server = new ControlledWebSocketServer();
    const base = {
      verifier: new NoopVerifier(),
      relayDirectory: directory,
      WebSocket: server.WebSocket,
      skipFetchNip11: true,
    };
    const waiting = new RxNostr({ ...base, relayHealthPolicy: policy });
    const probe = new RxNostr({ ...base, relayHealthPolicy: false });

    waiting.setHotRelays(relay);
    expect(server.connections.length).toBe(0);
    probe.setHotRelays(relay);
    server.sockets.latest.open();
    await vi.advanceTimersByTimeAsync(0);
    expect(server.connections.length).toBe(2);
    server.sockets.latest.open();
    await vi.advanceTimersByTimeAsync(0);
    waiting.dispose();
    probe.dispose();

    for (const socket of server.connections) {
      socket.acknowledgeClose();
    }

    await vi.advanceTimersByTimeAsync(0);
  });

  test("shares a single confirmation attempt and supports manually resetting health", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100);
    const directory = downDirectory();
    const restored = new RelayDirectory();

    restored.importSnapshot(directory.exportSnapshot());
    expect(restored.get(relay)?.firstFailureAt).toBe(0);
    const server = new ControlledWebSocketServer();
    const config = {
      verifier: new NoopVerifier(),
      WebSocket: server.WebSocket,
      relayDirectory: restored,
      relayHealthPolicy: policy,
      skipFetchNip11: true,
      reconnector: { reconnect: () => ({ action: "retry", delay: 0 }) as const },
    };
    const first = new RxNostr(config);
    const second = new RxNostr(config);
    const states: ConnectionState[] = [];

    second.monitorConnectionState().subscribe((packet) => states.push(packet.state));
    first.setHotRelays(relay);
    second.setHotRelays(relay);
    await vi.advanceTimersByTimeAsync(100);
    expect(server.connections.length).toBe(1);
    expect(states.at(-1)).toMatchObject({
      suppressionReasons: [
        { category: "relay-health" },
        { category: "coordination", kind: "relay-probe" },
      ],
    });
    expect(restored.forget(relay)).toBe(false);
    server.sockets.latest.peerClose(1006, "confirmation failed");
    await vi.advanceTimersByTimeAsync(0);
    expect(server.connections.length).toBe(1);
    restored.resetHealth(relay);
    await vi.advanceTimersByTimeAsync(0);
    expect(server.connections.length).toBe(3);

    for (const socket of server.connections) {
      if (socket.readyState === 0) {
        socket.open();
      }
    }

    await vi.advanceTimersByTimeAsync(0);
    first.dispose();
    second.dispose();

    for (const socket of server.connections) {
      socket.acknowledgeClose();
    }

    await vi.advanceTimersByTimeAsync(0);
  });

  test("releasing the last demand cancels a suppressed recovery", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100);
    const directory = downDirectory();
    const server = new ControlledWebSocketServer();
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      WebSocket: server.WebSocket,
      relayDirectory: directory,
      relayHealthPolicy: policy,
      skipFetchNip11: true,
      reconnector: { reconnect: () => ({ action: "retry", delay: 0 }) },
    });

    rxNostr.setHotRelays(relay);
    await vi.advanceTimersByTimeAsync(100);
    server.sockets.latest.peerClose(1006, "still down");
    await vi.advanceTimersByTimeAsync(0);
    rxNostr.unsetHotRelays();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(server.connections.length).toBe(1);
    expect(directory.forget(relay)).toBe(true);
    rxNostr.dispose();
    await vi.advanceTimersByTimeAsync(0);
  });
  test("does not impose browser lifecycle control on an arbitrary reconnector", async () => {
    vi.useFakeTimers();
    const environment = {
      window: new Target(),
      document: new Target(),
      navigator: { onLine: false },
    };

    vi.stubGlobal("window", environment.window);
    vi.stubGlobal("document", environment.document);
    vi.stubGlobal("navigator", environment.navigator);
    const server = new ControlledWebSocketServer();
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      WebSocket: server.WebSocket,
      relayDirectory: new RelayDirectory(),
      skipFetchNip11: true,
      reconnector: { reconnect: () => ({ action: "retry", delay: 0 }) },
    });
    const states: ConnectionState[] = [];

    rxNostr.monitorConnectionState().subscribe((packet) => states.push(packet.state));
    rxNostr.setHotRelays(relay);
    expect(server.connections.length).toBe(1);
    server.sockets.latest.open();
    await vi.advanceTimersByTimeAsync(0);
    server.sockets.latest.peerClose(1006, "recover");
    await vi.advanceTimersByTimeAsync(0);
    expect(server.connections.length).toBe(2);
    expect(states.find((state) => state.state === "waiting-for-connection")).not.toHaveProperty(
      "suppressionReasons",
    );
    expect(environment.window.size + environment.document.size).toBe(0);
    server.sockets.latest.open();
    await vi.advanceTimersByTimeAsync(0);
    rxNostr.dispose();
    server.sockets.latest.acknowledgeClose();
    await vi.advanceTimersByTimeAsync(0);
  });
});

describe("suppression ownership and asynchronous decisions", () => {
  test("retains a suppressed record and wakes demand immediately on reset", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100);
    const directory = downDirectory();
    const server = new ControlledWebSocketServer();
    const client = new RxNostr({
      verifier: new NoopVerifier(),
      WebSocket: server.WebSocket,
      relayDirectory: directory,
      relayHealthPolicy: policy,
      skipFetchNip11: true,
    });

    client.setHotRelays(relay);
    expect(directory.forget(relay)).toBe(false);
    directory.resetHealth(relay);
    await vi.advanceTimersByTimeAsync(0);
    expect(server.connections).toHaveLength(1);
    client.dispose();
    server.sockets.latest.acknowledgeClose();
    await vi.advanceTimersByTimeAsync(0);
    expect(directory.forget(relay)).toBe(true);
  });

  test.each(["throw", "invalid"])(
    "ends admission with a visible policy error: %s",
    async (mode) => {
      vi.useFakeTimers();
      vi.setSystemTime(100);
      const directory = new RelayDirectory();
      const server = new ControlledWebSocketServer();
      const states: ConnectionState[] = [];
      const client = new RxNostr({
        verifier: new NoopVerifier(),
        WebSocket: server.WebSocket,
        relayDirectory: directory,
        skipFetchNip11: true,
        relayHealthPolicy: {
          getSuppression() {
            if (mode === "throw") {
              throw new Error("invalid application policy");
            }

            return { suppressedUntil: NaN };
          },
        },
      });

      client.monitorConnectionState().subscribe((p) => states.push(p.state));
      client.setHotRelays(relay);
      await vi.advanceTimersByTimeAsync(0);
      expect(states.at(-1)).toMatchObject({ state: "failed", reason: { kind: "policy-error" } });
      expect(server.connections).toHaveLength(0);
      expect(directory.get(relay)?.consecutiveFailures).toBe(0);
      expect(directory.forget(relay)).toBe(true);
      client.dispose();
      await vi.advanceTimersByTimeAsync(0);
    },
  );

  test("combines pending reconnect reasons with health and waits for both", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100);
    const directory = downDirectory();
    const server = new ControlledWebSocketServer();
    let resolve!: (value: { action: "retry"; delay: number }) => void;
    const states: ConnectionState[] = [];
    const client = new RxNostr({
      verifier: new NoopVerifier(),
      WebSocket: server.WebSocket,
      relayDirectory: directory,
      relayHealthPolicy: policy,
      skipFetchNip11: true,
      reconnector: {
        reconnect(context) {
          context.reportWaiting?.({
            suppressionReasons: [{ category: "environment", source: "custom", kind: "offline" }],
          });

          return new Promise((r) => {
            resolve = r;
          });
        },
      },
    });

    client.monitorConnectionState().subscribe((p) => states.push(p.state));
    client.setHotRelays(relay);
    await vi.advanceTimersByTimeAsync(100);
    server.sockets.latest.peerClose(1006, "still down");
    await vi.advanceTimersByTimeAsync(0);
    expect(states.at(-1)).toMatchObject({
      state: "waiting-for-connection",
      suppressionReasons: [{ category: "relay-health" }, { category: "environment" }],
    });
    expect(states.at(-1)).not.toHaveProperty("nextAttemptAt");
    resolve({ action: "retry", delay: 50 });
    await vi.advanceTimersByTimeAsync(50);
    expect(server.connections).toHaveLength(1);
    expect(states.at(-1)).toMatchObject({
      suppressionReasons: [{ category: "relay-health" }],
    });
    await vi.advanceTimersByTimeAsync(150);
    expect(server.connections).toHaveLength(2);
    server.sockets.latest.open();
    await vi.advanceTimersByTimeAsync(0);
    client.dispose();
    server.sockets.latest.acknowledgeClose();
    await vi.advanceTimersByTimeAsync(0);
  });

  test.each(["cancel", "exhaust"] as const)(
    "does not let an expired health deadline override pending %s",
    async (action) => {
      vi.useFakeTimers();
      vi.setSystemTime(100);
      const server = new ControlledWebSocketServer();
      const directory = downDirectory();
      let resolve!: (value: { action: typeof action }) => void;
      const client = new RxNostr({
        verifier: new NoopVerifier(),
        WebSocket: server.WebSocket,
        relayDirectory: directory,
        relayHealthPolicy: policy,
        skipFetchNip11: true,
        reconnector: {
          reconnect: () =>
            new Promise((r) => {
              resolve = r;
            }),
        },
      });

      client.setHotRelays(relay);
      await vi.advanceTimersByTimeAsync(100);
      server.sockets.latest.peerClose(1006, "still down");
      await vi.advanceTimersByTimeAsync(2000);
      expect(server.connections).toHaveLength(1);
      resolve({ action });
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(2000);
      expect(server.connections).toHaveLength(1);
      expect(directory.forget(relay)).toBe(true);
      client.dispose();
      await vi.advanceTimersByTimeAsync(0);
    },
  );

  test("times out a shared confirmation attempt and releases its ownership", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100);
    const directory = downDirectory();
    const server = new ControlledWebSocketServer();
    const config = {
      verifier: new NoopVerifier(),
      WebSocket: server.WebSocket,
      relayDirectory: directory,
      relayHealthPolicy: policy,
      connectionTimeout: 10,
      skipFetchNip11: true,
      reconnector: { reconnect: () => ({ action: "retry", delay: 0 }) as const },
    };
    const first = new RxNostr(config),
      second = new RxNostr(config);

    first.setHotRelays(relay);
    second.setHotRelays(relay);
    await vi.advanceTimersByTimeAsync(100);
    expect(server.connections).toHaveLength(1);
    const stalled = server.sockets.latest;

    await vi.advanceTimersByTimeAsync(10);
    expect(stalled.readyState).not.toBe(0);
    expect(directory.get(relay)?.consecutiveFailures).toBe(3);
    await vi.advanceTimersByTimeAsync(200);
    expect(server.connections).toHaveLength(2);
    server.sockets.latest.open();
    await vi.advanceTimersByTimeAsync(0);
    expect(server.connections).toHaveLength(3);
    server.sockets.latest.open();
    await vi.advanceTimersByTimeAsync(0);
    first.dispose();
    second.dispose();

    for (const socket of server.connections) {
      socket.acknowledgeClose();
    }

    await vi.advanceTimersByTimeAsync(0);
    expect(directory.forget(relay)).toBe(true);
  });

  test("aborts a pending decision when demand ends and ignores a late retry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100);
    const directory = downDirectory(),
      server = new ControlledWebSocketServer();
    let resolve!: (value: { action: "retry"; delay: number }) => void;
    let signal!: AbortSignal;
    const client = new RxNostr({
      verifier: new NoopVerifier(),
      WebSocket: server.WebSocket,
      relayDirectory: directory,
      relayHealthPolicy: policy,
      skipFetchNip11: true,
      reconnector: {
        reconnect(context) {
          signal = context.signal;

          return new Promise((r) => {
            resolve = r;
          });
        },
      },
    });

    client.setHotRelays(relay);
    await vi.advanceTimersByTimeAsync(100);
    server.sockets.latest.peerClose(1006, "still down");
    await vi.advanceTimersByTimeAsync(0);
    client.unsetHotRelays();
    await vi.advanceTimersByTimeAsync(0);
    expect(signal.aborted).toBe(true);
    resolve({ action: "retry", delay: 0 });
    await vi.advanceTimersByTimeAsync(10000);
    expect(server.connections).toHaveLength(1);
    expect(directory.forget(relay)).toBe(true);
    client.dispose();
    await vi.advanceTimersByTimeAsync(0);
  });
});

test("a failing recovery strategy terminates with policy-error, not relay failure", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(100);
  const directory = new RelayDirectory(),
    server = new ControlledWebSocketServer();
  const states: ConnectionState[] = [];
  let broken = false;
  const client = new RxNostr({
    verifier: new NoopVerifier(),
    WebSocket: server.WebSocket,
    relayDirectory: directory,
    skipFetchNip11: true,
    reconnector: { reconnect: () => ({ action: "retry", delay: 0 }) },
    relayHealthPolicy: {
      getSuppression() {
        if (broken) {
          throw new Error("broken strategy");
        }

        return undefined;
      },
    },
  });

  client.monitorConnectionState().subscribe((p) => states.push(p.state));
  client.setHotRelays(relay);
  server.sockets.latest.open();
  await vi.advanceTimersByTimeAsync(0);

  broken = true;

  server.sockets.latest.peerClose(1006, "lost connection");
  await vi.advanceTimersByTimeAsync(0);
  expect(states.at(-1)).toMatchObject({ state: "failed", reason: { kind: "policy-error" } });
  expect(directory.get(relay)?.consecutiveFailures).toBe(1);
  expect(directory.forget(relay)).toBe(true);
  client.dispose();
  await vi.advanceTimersByTimeAsync(0);
});

test("preserves detector reports without attributing known local failures to relay health", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(100);
  const directory = new RelayDirectory(),
    server = new ControlledWebSocketServer();
  let drop!: () => void;
  let sessionSignal!: AbortSignal;
  const reconnect = vi.fn(() => ({ action: "retry", delay: 100 }) as const);
  const client = new RxNostr({
    verifier: new NoopVerifier(),
    WebSocket: server.WebSocket,
    relayDirectory: directory,
    skipFetchNip11: true,
    reconnector: { reconnect },
    dropDetectors: [
      {
        name: "custom-local",
        setup(context) {
          sessionSignal = context.sessionSignal!;
          drop = () => context.drop({ reason: "local-unavailable", affectsRelayHealth: false });
        },
      },
    ],
  });

  client.setHotRelays(relay);
  server.sockets.latest.open();
  await vi.advanceTimersByTimeAsync(0);
  drop();
  await vi.advanceTimersByTimeAsync(0);
  expect(directory.get(relay)?.consecutiveFailures).toBe(0);
  expect(reconnect).toHaveBeenCalledWith(
    expect.objectContaining({
      reason: expect.objectContaining({
        detector: { name: "custom-local", registrationIndex: 0, reason: "local-unavailable" },
      }),
    }),
  );
  expect(sessionSignal.aborted).toBe(false);
  client.dispose();
  await vi.advanceTimersByTimeAsync(0);
  expect(sessionSignal.aborted).toBe(true);
});

test("a reported wait remains pending until the reconnector decides", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(100);
  const server = new ControlledWebSocketServer(),
    states: ConnectionState[] = [];
  let resolve!: (value: { action: "retry"; delay: number }) => void;
  const client = new RxNostr({
    verifier: new NoopVerifier(),
    WebSocket: server.WebSocket,
    relayDirectory: new RelayDirectory(),
    skipFetchNip11: true,
    reconnector: {
      reconnect(context) {
        context.reportWaiting?.({
          suppressionReasons: [{ category: "environment", source: "custom", kind: "resume" }],
        });

        return new Promise((r) => {
          resolve = r;
        });
      },
    },
  });

  client.monitorConnectionState().subscribe((p) => states.push(p.state));
  client.setHotRelays(relay);
  server.sockets.latest.peerClose(1006, "failed");
  await vi.advanceTimersByTimeAsync(0);
  expect(states.at(-1)).toMatchObject({ state: "waiting-for-connection" });
  await vi.advanceTimersByTimeAsync(100);
  expect(server.connections).toHaveLength(1);
  expect(states.at(-1)).not.toHaveProperty("nextAttemptAt");
  client.dispose();
  await vi.advanceTimersByTimeAsync(0);
  resolve({ action: "retry", delay: 0 });
  await vi.advanceTimersByTimeAsync(0);
  expect(server.connections).toHaveLength(1);
});

test("a state observer can reset health without leaving a stale wait timer", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(100);
  const directory = downDirectory(),
    server = new ControlledWebSocketServer();
  const client = new RxNostr({
    verifier: new NoopVerifier(),
    WebSocket: server.WebSocket,
    relayDirectory: directory,
    relayHealthPolicy: policy,
    skipFetchNip11: true,
  });
  let reset = false;

  client.monitorConnectionState().subscribe(({ state }) => {
    if (state.state === "waiting-for-connection" && !reset) {
      reset = true;

      directory.resetHealth(relay);
    }
  });
  client.setHotRelays(relay);
  await vi.advanceTimersByTimeAsync(0);
  expect(server.connections).toHaveLength(1);
  server.sockets.latest.open();
  await vi.advanceTimersByTimeAsync(0);
  client.dispose();
  server.sockets.latest.acknowledgeClose();
  await vi.advanceTimersByTimeAsync(0);
  expect(vi.getTimerCount()).toBe(0);
});
