import { firstValueFrom, map, toArray } from "rxjs";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ControlledWebSocketServer, Faker } from "../../../__test__/helper/index.ts";
import { SubscriptionInspector } from "../../../__test__/helper/subscription-inspector.ts";
import type { ConnectionDropDetectorContext } from "../../../connection-drop-detector/index.ts";
import type {
  ConnectionReconnector,
  ConnectionReconnectorContext,
} from "../../../connection-reconnector/index.ts";
import type { ConnectionState } from "../../../connection-state.ts";
import type { RxNostrDiagnostic } from "../../../diagnostics/index.ts";
import { NostrTransport, NostrTransportOperationError } from "./nostr-transport.ts";

const relay = "wss://relay.example.com" as const;

afterEach(() => vi.useRealTimers());

async function openTransport(
  server: ControlledWebSocketServer,
  reconnector?: ConnectionReconnector,
  onDiagnostic?: (diagnostic: RxNostrDiagnostic) => void,
) {
  const transport = new NostrTransport({
    url: relay,
    WebSocket: server.WebSocket,
    reconnector,
    onDiagnostic,
  });
  const opened = transport.open();
  const socket = server.sockets.latest;
  socket.open();
  await opened;
  return transport;
}

async function closeTransport(transport: NostrTransport, server: ControlledWebSocketServer) {
  const closed = transport.close();
  const socket = server.sockets.latest;
  socket.acknowledgeClose();
  await closed;
}

describe("NostrTransport", () => {
  test("replays and maps the initial, retry, ready, and idle lifecycle", async () => {
    const server = new ControlledWebSocketServer();
    const transport = new NostrTransport({
      url: relay,
      WebSocket: server.WebSocket,
      reconnector: { reconnect: () => ({ action: "retry", delay: 0 }) },
    });
    const inspector = new SubscriptionInspector<ConnectionState>();
    transport.state$.subscribe(inspector);

    await expect(inspector.waitNext()).resolves.toEqual({ state: "dormant" });
    const opened = transport.open();
    await expect(inspector.waitNext()).resolves.toEqual({ state: "connecting", attempt: 1 });

    const firstSocket = server.sockets.latest;
    firstSocket.peerClose(1006, "offline");
    await expect(inspector.waitNext()).resolves.toEqual({
      state: "waiting-for-retry",
      attempt: 1,
      delay: 0,
      reason: { kind: "connection-dropped", code: 1006, message: "offline" },
    });
    await expect(inspector.waitNext()).resolves.toEqual({ state: "retrying", attempt: 1 });
    const secondSocket = server.sockets.latest;
    secondSocket.open();
    await opened;
    await expect(inspector.waitNext()).resolves.toEqual({ state: "connected" });

    await closeTransport(transport, server);
    await expect(inspector.waitNext()).resolves.toEqual({ state: "dormant" });
  });

  test("exposes an exact retry delay and a typed terminal failure", async () => {
    vi.useFakeTimers();
    const server = new ControlledWebSocketServer();
    const transport = new NostrTransport({
      url: relay,
      WebSocket: server.WebSocket,
      reconnector: { reconnect: () => ({ action: "retry", delay: 100 }) },
    });
    const firstInspector = new SubscriptionInspector<ConnectionState>();
    transport.state$.subscribe(firstInspector);

    const opened = transport.open();
    const socket = server.sockets.latest;
    socket.peerClose(1000, "try later", true);
    await firstInspector.ignoreNexts(2);
    await expect(firstInspector.waitNext()).resolves.toMatchObject({
      state: "waiting-for-retry",
      attempt: 1,
      delay: 100,
    });
    expect(server.connections).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(server.connections).toHaveLength(2);
    const socket2 = server.sockets.latest;
    socket2.open();
    await opened;
    await closeTransport(transport, server);

    const terminalServer = new ControlledWebSocketServer();
    const terminal = new NostrTransport({
      url: "wss://terminal.example.com",
      WebSocket: terminalServer.WebSocket,
      reconnector: { reconnect: () => ({ action: "exhaust" }) },
    });
    const secondInspector = new SubscriptionInspector<ConnectionState>();
    terminal.state$.subscribe(secondInspector);
    const terminalOpen = terminal.open();
    const terminalSocket = terminalServer.sockets.latest;
    terminalSocket.peerClose(1000, "maintenance", true);
    await expect(terminalOpen).rejects.toMatchObject({
      name: "UniplsOpenError",
    });
    await secondInspector.ignoreNexts(2);
    await expect(secondInspector.waitNext()).resolves.toEqual({
      state: "failed",
      attempt: 1,
      reason: {
        kind: "retry-exhausted",
        code: 1000,
        message: "maintenance",
      },
    });

    await terminal.dispose();
  });

  test("cancels a pending retry when disposed", async () => {
    vi.useFakeTimers();
    const server = new ControlledWebSocketServer();
    const transport = new NostrTransport({
      url: relay,
      WebSocket: server.WebSocket,
      reconnector: { reconnect: () => ({ action: "retry", delay: 100 }) },
    });
    const inspector = new SubscriptionInspector<string>();
    transport.state$.pipe(map((state) => state.state)).subscribe(inspector);

    const opened = transport.open();
    const socket = server.sockets.latest;
    socket.peerClose(1006, "offline");
    void opened.catch(() => {});
    await inspector.ignoreNexts(2);
    await expect(inspector.waitNext()).resolves.toBe("waiting-for-retry");
    await transport.dispose();
    await vi.advanceTimersByTimeAsync(100);

    expect(server.connections).toHaveLength(1);
    await expect(inspector.waitNext()).resolves.toBe("dormant");
    await expect(inspector.waitNext()).resolves.toBe("disposed");
  });

  test("opens, decodes messages, casts tuples, and closes by user", async () => {
    const server = new ControlledWebSocketServer();
    const transport = await openTransport(server);
    const firstInspector = new SubscriptionInspector<string>();
    const secondInspector = new SubscriptionInspector<string>();
    transport.messages$.pipe(map((packet) => packet.type)).subscribe(firstInspector);
    transport.state$.pipe(map((state) => state.state)).subscribe(secondInspector);

    const socket = server.sockets.latest;

    socket.message(["NOTICE", "hello"]);
    await transport.cast(["CLOSE", "sub"]);

    await expect(firstInspector.waitNext()).resolves.toEqual("NOTICE");
    await expect(socket.inbox.waitNext()).resolves.toEqual(["CLOSE", "sub"]);

    await closeTransport(transport, server);
    await expect(secondInspector.waitNext()).resolves.toBe("connected");
    await expect(secondInspector.waitNext()).resolves.toBe("dormant");
  });

  test.each(["not-json", '["EVENT","missing-event"]', new Uint8Array([1, 2, 3])])(
    "reports invalid input as a diagnostic and keeps the session alive",
    async (input) => {
      const server = new ControlledWebSocketServer();
      const diagnostics: RxNostrDiagnostic[] = [];
      const transport = await openTransport(server, undefined, (diagnostic) => {
        diagnostics.push(diagnostic);
      });
      const inspector = new SubscriptionInspector<string>();
      transport.messages$.pipe(map((value) => value.type)).subscribe(inspector);

      const socket = server.sockets.latest;

      socket.rawMessage(input);
      socket.message(["NOTICE", "still alive"]);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({
        event: "message/deserialization",
        context: { relay, input: expect.any(Object) },
      });
      await expect(inspector.waitNext()).resolves.toEqual("NOTICE");
      await closeTransport(transport, server);
    },
  );

  test("maps subscribe termination and RxJS unsubscribe exactly once", async () => {
    const server = new ControlledWebSocketServer();
    const transport = await openTransport(server);
    const event = Faker.event({ id: "one" });
    const inspector = new SubscriptionInspector<string>();
    const subscription = transport
      .subscribe({
        query: ["REQ", "sub", {}],
        selector: (packet) => packet.type === "EVENT" && packet.subId === "sub",
        terminator: (packet) => packet.type === "EOSE" && packet.subId === "sub",
      })
      .pipe(map((packet) => packet.type))
      .subscribe(inspector);

    const socket = server.sockets.latest;
    await expect(socket.inbox.waitNext()).resolves.toEqual(["REQ", "sub", {}]);
    await Promise.resolve();
    socket.message(["EVENT", "sub", event]);
    socket.message(["EOSE", "sub"]);
    await expect(inspector.waitNext()).resolves.toBe("EVENT");
    await expect(inspector.waitComplete()).resolves.toBeUndefined();

    subscription.unsubscribe();
    subscription.unsubscribe();
    expect(inspector.completed).toBe(true);
    expect(socket.inbox.length).toBe(1);
    await closeTransport(transport, server);
  });

  test("maps timeout and drop finalizations to transport errors", async () => {
    const timeoutServer = new ControlledWebSocketServer();
    const timeoutTransport = await openTransport(timeoutServer);
    await expect(
      firstValueFrom(timeoutTransport.listen({ timeout: 5 }).pipe(toArray())),
    ).rejects.toMatchObject({
      name: "NostrTransportOperationError",
      reason: "timeout",
    });
    await closeTransport(timeoutTransport, timeoutServer);

    const dropServer = new ControlledWebSocketServer();
    const dropTransport = await openTransport(dropServer);
    const dropped = firstValueFrom(dropTransport.listen({ retry: "fail" }).pipe(toArray()));
    const socket = dropServer.sockets.latest;
    socket.peerClose(1006, "network lost");
    await expect(dropped).rejects.toMatchObject({
      name: "NostrTransportOperationError",
      reason: "dropped",
    });
  });

  test("reconnects and ignores delayed messages from an old transport epoch", async () => {
    const server = new ControlledWebSocketServer();
    const reconnector: ConnectionReconnector = {
      reconnect: vi.fn(() => ({ action: "retry", delay: 0 }) as const),
    };
    const transport = await openTransport(server, reconnector);
    const oldSocket = server.sockets.latest;
    const firstInspector = new SubscriptionInspector<string>();
    const secondInspector = new SubscriptionInspector<string>();
    transport.messages$.pipe(map((packet) => packet.type)).subscribe(firstInspector);
    transport.state$.pipe(map((state) => state.state)).subscribe(secondInspector);

    oldSocket.peerClose(1006, "network lost");
    await expect(server.connections.wait(1)).resolves.toBeDefined();
    const newSocket = server.sockets.latest;
    newSocket.open();
    await vi.waitFor(() => expect(reconnector.reconnect).toHaveBeenCalledOnce());
    expect(reconnector.reconnect).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "recovery",
        attempt: 1,
        health: expect.objectContaining({ consecutiveFailures: 1 }),
      }),
    );
    await expect(secondInspector.waitNext()).resolves.toBe("connected");
    await expect(secondInspector.waitNext()).resolves.toBe("waiting-for-retry");
    await expect(secondInspector.waitNext()).resolves.toBe("retrying");
    await expect(secondInspector.waitNext()).resolves.toBe("connected");

    oldSocket.message(["NOTICE", "stale"]);
    newSocket.message(["NOTICE", "current"]);
    await expect(firstInspector.waitNext()).resolves.toEqual("NOTICE");

    await closeTransport(transport, server);
  });

  test("adapts Nostr drop detectors and resets the attempt for each recovery cycle", async () => {
    const server = new ControlledWebSocketServer();
    const contexts: ConnectionDropDetectorContext[] = [];
    const deferredCleanup = vi.fn();
    const returnedCleanup = vi.fn();
    const reconnect = vi.fn((_context: ConnectionReconnectorContext) => {
      return { action: "retry", delay: 0 } as const;
    });
    const transport = new NostrTransport({
      url: relay,
      WebSocket: server.WebSocket,
      reconnector: { reconnect },
      dropDetectors: [
        {
          name: "health-check",
          setup(context) {
            contexts.push(context);
            context.defer(deferredCleanup, { name: "deferred-health-check-cleanup" });
            return returnedCleanup;
          },
        },
      ],
    });

    const opened = transport.open();
    const socket = server.sockets.latest;
    socket.open();
    await opened;
    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      relay,
      detector: { registrationIndex: 0, name: "health-check" },
    });

    const response = contexts[0]!.request({
      query: ["REQ", "health", {}],
      selector: (message) => message[0] === "EOSE" && message[1] === "health",
    });
    await expect(socket.inbox.waitNext()).resolves.toEqual(["REQ", "health", {}]);
    socket.message(["EOSE", "health"]);
    await expect(response).resolves.toEqual(["EOSE", "health"]);

    contexts[0]!.drop();
    await expect(server.connections.wait(1)).resolves.toBeDefined();
    expect(reconnect).toHaveBeenLastCalledWith(
      expect.objectContaining({
        relay,
        phase: "recovery",
        attempt: 1,
        reason: { kind: "connection-dropped" },
      }),
    );
    expect(contexts[0]!.signal.aborted).toBe(true);
    expect(deferredCleanup).toHaveBeenCalledOnce();
    expect(returnedCleanup).toHaveBeenCalledOnce();
    const socket2 = server.sockets.latest;
    socket2.open();
    await vi.waitFor(() => expect(contexts).toHaveLength(2));

    socket2.peerClose(1006, "again");
    await expect(server.connections.wait(2)).resolves.toBeDefined();
    expect(reconnect.mock.calls.map(([context]) => context.attempt)).toEqual([1, 1]);
    const thirdSocket = server.sockets.latest;
    thirdSocket.open();
    await vi.waitFor(() => expect(contexts).toHaveLength(3));

    await closeTransport(transport, server);
    expect(deferredCleanup).toHaveBeenCalledTimes(3);
    expect(returnedCleanup).toHaveBeenCalledTimes(3);
  });

  test("applies the rx-nostr retry policy to an initial connection failure", async () => {
    const server = new ControlledWebSocketServer();
    const reconnector: ConnectionReconnector = {
      reconnect: vi.fn(() => ({ action: "retry", delay: 0 }) as const),
    };
    const transport = new NostrTransport({
      url: relay,
      WebSocket: server.WebSocket,
      reconnector,
    });

    const opened = transport.open();
    const socket = server.sockets.latest;
    socket.peerClose(1006, "initial failure");
    await expect(server.connections.wait(1)).resolves.toBeDefined();
    const socket2 = server.sockets.latest;
    socket2.open();
    await opened;

    expect(reconnector.reconnect).toHaveBeenCalledWith(
      expect.objectContaining({
        relay,
        phase: "initial",
        attempt: 1,
        reason: expect.objectContaining({ kind: "connection-dropped" }),
      }),
    );
    await closeTransport(transport, server);
  });

  test.each(["cancel", "exhaust"] as const)(
    "maps the %s retry decision to a failed open",
    async (action) => {
      const server = new ControlledWebSocketServer();
      const transport = new NostrTransport({
        url: relay,
        WebSocket: server.WebSocket,
        reconnector: { reconnect: () => ({ action }) },
      });

      const opened = transport.open();
      const socket = server.sockets.latest;
      socket.peerClose(1006, "initial failure");

      await expect(opened).rejects.toMatchObject({ name: "UniplsOpenError" });
      expect(server.connections).toHaveLength(1);
    },
  );

  test("classifies transport errors as drops", async () => {
    const server = new ControlledWebSocketServer();
    const transport = await openTransport(server);
    const inspector = new SubscriptionInspector<string>();
    transport.state$.pipe(map((state) => state.state)).subscribe(inspector);
    const result = firstValueFrom(transport.listen({ retry: "fail" }).pipe(toArray()));

    const socket = server.sockets.latest;

    socket.error(new Error("offline"));

    await expect(result).rejects.toBeInstanceOf(NostrTransportOperationError);
    await expect(inspector.waitNext()).resolves.toBe("connected");
    await expect(inspector.waitNext()).resolves.toBe("failed");
  });

  test("dispose is idempotent and completes adapter-owned streams", async () => {
    const server = new ControlledWebSocketServer();
    const transport = await openTransport(server);
    const inspector = new SubscriptionInspector<unknown>();

    transport.messages$.subscribe(inspector);

    const first = transport.dispose();
    const second = transport.dispose();
    expect(second).toBe(first);
    const socket = server.sockets.latest;
    socket.acknowledgeClose();
    await first;

    expect(inspector.completed).toBe(true);
    socket.message(["NOTICE", "late"]);
    expect(inspector.length).toBe(0);
  });
});
