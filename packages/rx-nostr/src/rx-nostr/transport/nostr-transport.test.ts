import { firstValueFrom, toArray } from "rxjs";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ControlledWebSocketServer, expectSent, Faker } from "../../__test__/helper/index.ts";
import type { ConnectionDropDetectorContext } from "../../connection-drop-detector/index.ts";
import type {
  ConnectionReconnector,
  ConnectionReconnectorContext,
} from "../../connection-reconnector/index.ts";
import { NostrTransport, NostrTransportOperationError } from "./nostr-transport.ts";

const relay = "wss://relay.example.com" as const;

afterEach(() => vi.useRealTimers());

async function openTransport(
  server: ControlledWebSocketServer,
  reconnector?: ConnectionReconnector,
) {
  const transport = new NostrTransport({
    url: relay,
    WebSocket: server.WebSocket,
    reconnector,
  });
  const opened = transport.open();
  server.sockets.latest.open();
  await opened;
  return transport;
}

async function closeTransport(transport: NostrTransport, server: ControlledWebSocketServer) {
  const closed = transport.close();
  server.sockets.latest.acknowledgeClose();
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
    const states: import("../../connection-state.ts").ConnectionState[] = [];
    transport.state$.subscribe((state) => states.push(state));

    const opened = transport.open();
    server.sockets.latest.peerClose(1006, "offline");
    await vi.waitFor(() => expect(server.connections).toHaveLength(2));
    server.sockets.latest.open();
    await opened;

    expect(states).toEqual([
      { state: "dormant" },
      { state: "connecting", attempt: 1 },
      {
        state: "waiting-for-retry",
        attempt: 1,
        delay: 0,
        reason: {
          kind: "connection-dropped",
          code: 1006,
          message: "offline",
        },
      },
      { state: "retrying", attempt: 1 },
      { state: "connected" },
    ]);

    await closeTransport(transport, server);
    expect(states.at(-1)).toEqual({ state: "dormant" });
  });

  test("exposes an exact retry delay and a typed terminal failure", async () => {
    vi.useFakeTimers();
    const server = new ControlledWebSocketServer();
    const transport = new NostrTransport({
      url: relay,
      WebSocket: server.WebSocket,
      reconnector: { reconnect: () => ({ action: "retry", delay: 100 }) },
    });
    const states: import("../../connection-state.ts").ConnectionState[] = [];
    transport.state$.subscribe((state) => states.push(state));

    const opened = transport.open();
    server.sockets.latest.peerClose(1000, "try later", true);
    await vi.waitFor(() =>
      expect(states).toContainEqual(
        expect.objectContaining({
          state: "waiting-for-retry",
          attempt: 1,
          delay: 100,
        }),
      ),
    );
    expect(server.connections).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(server.connections).toHaveLength(2);
    server.sockets.latest.open();
    await opened;
    await closeTransport(transport, server);

    const terminalServer = new ControlledWebSocketServer();
    const terminal = new NostrTransport({
      url: "wss://terminal.example.com",
      WebSocket: terminalServer.WebSocket,
      reconnector: { reconnect: () => ({ action: "exhaust" }) },
    });
    const terminalStates: import("../../connection-state.ts").ConnectionState[] = [];
    terminal.state$.subscribe((state) => terminalStates.push(state));
    const terminalOpen = terminal.open();
    terminalServer.sockets.latest.peerClose(1000, "maintenance", true);
    await expect(terminalOpen).rejects.toMatchObject({
      name: "UniplsOpenError",
    });
    expect(terminalStates.at(-1)).toEqual({
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
    const states: string[] = [];
    transport.state$.subscribe((state) => states.push(state.state));

    const opened = transport.open();
    server.sockets.latest.peerClose(1006, "offline");
    void opened.catch(() => {});
    await vi.waitFor(() => expect(states).toContain("waiting-for-retry"));
    await transport.dispose();
    await vi.advanceTimersByTimeAsync(100);

    expect(server.connections).toHaveLength(1);
    expect(states.at(-1)).toBe("disposed");
  });

  test("opens, decodes messages, casts tuples, and closes by user", async () => {
    const server = new ControlledWebSocketServer();
    const transport = await openTransport(server);
    const messages: string[] = [];
    const states: string[] = [];
    transport.messages$.subscribe((packet) => messages.push(packet.type));
    transport.state$.subscribe((state) => states.push(state.state));

    server.sockets.latest.message(["NOTICE", "hello"]);
    await transport.cast(["CLOSE", "sub"]);

    expect(messages).toEqual(["NOTICE"]);
    expect(server.sockets.latest.sent).toEqual([["CLOSE", "sub"]]);

    await closeTransport(transport, server);
    expect(states).toContain("dormant");
  });

  test.each(["not-json", '["EVENT","missing-event"]', new Uint8Array([1, 2, 3])])(
    "reports invalid input as a diagnostic and keeps the session alive",
    async (input) => {
      const server = new ControlledWebSocketServer();
      const transport = await openTransport(server);
      const diagnostics: string[] = [];
      const messages: string[] = [];
      transport.diagnostics$.subscribe((value) => diagnostics.push(value.type));
      transport.messages$.subscribe((value) => messages.push(value.type));

      server.sockets.latest.rawMessage(input);
      server.sockets.latest.message(["NOTICE", "still alive"]);

      await vi.waitFor(() => expect(diagnostics).toEqual(["message-deserialization-failed"]));
      expect(messages).toEqual(["NOTICE"]);
      await closeTransport(transport, server);
    },
  );

  test("maps subscribe termination and RxJS unsubscribe exactly once", async () => {
    const server = new ControlledWebSocketServer();
    const transport = await openTransport(server);
    const event = Faker.event({ id: "one" });
    const received: string[] = [];
    let completions = 0;
    const subscription = transport
      .subscribe({
        query: ["REQ", "sub", {}],
        selector: (packet) => packet.type === "EVENT" && packet.subId === "sub",
        terminator: (packet) => packet.type === "EOSE" && packet.subId === "sub",
      })
      .subscribe({
        next: (packet) => received.push(packet.type),
        complete: () => completions++,
      });

    expect(server.sockets.latest.sent).toEqual([["REQ", "sub", {}]]);
    await Promise.resolve();
    server.sockets.latest.message(["EVENT", "sub", event]);
    server.sockets.latest.message(["EOSE", "sub"]);
    await vi.waitFor(() => expect(completions).toBe(1));
    expect(received).toEqual(["EVENT"]);

    subscription.unsubscribe();
    subscription.unsubscribe();
    expect(completions).toBe(1);
    expect(server.sockets.latest.sent).toHaveLength(1);
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
    dropServer.sockets.latest.peerClose(1006, "network lost");
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
    const messages: string[] = [];
    const states: string[] = [];
    transport.messages$.subscribe((packet) => messages.push(packet.type));
    transport.state$.subscribe((state) => states.push(state.state));

    oldSocket.peerClose(1006, "network lost");
    await vi.waitFor(() => expect(server.connections).toHaveLength(2));
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
    await vi.waitFor(() => expect(states.filter((state) => state === "connected")).toHaveLength(2));

    oldSocket.message(["NOTICE", "stale"]);
    newSocket.message(["NOTICE", "current"]);
    expect(messages).toEqual(["NOTICE"]);

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
    server.sockets.latest.open();
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
    await expectSent(server.sockets.latest, "REQ");
    server.sockets.latest.message(["EOSE", "health"]);
    await expect(response).resolves.toEqual(["EOSE", "health"]);

    contexts[0]!.drop();
    await vi.waitFor(() => expect(server.connections).toHaveLength(2));
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
    server.sockets.latest.open();
    await vi.waitFor(() => expect(contexts).toHaveLength(2));

    server.sockets.latest.peerClose(1006, "again");
    await vi.waitFor(() => expect(server.connections).toHaveLength(3));
    expect(reconnect.mock.calls.map(([context]) => context.attempt)).toEqual([1, 1]);
    server.sockets.latest.open();
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
    server.sockets.latest.peerClose(1006, "initial failure");
    await vi.waitFor(() => expect(server.connections).toHaveLength(2));
    server.sockets.latest.open();
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
      server.sockets.latest.peerClose(1006, "initial failure");

      await expect(opened).rejects.toMatchObject({ name: "UniplsOpenError" });
      expect(server.connections).toHaveLength(1);
    },
  );

  test("classifies transport errors as drops", async () => {
    const server = new ControlledWebSocketServer();
    const transport = await openTransport(server);
    const states: string[] = [];
    transport.state$.subscribe((state) => states.push(state.state));
    const result = firstValueFrom(transport.listen({ retry: "fail" }).pipe(toArray()));

    server.sockets.latest.error(new Error("offline"));

    await expect(result).rejects.toBeInstanceOf(NostrTransportOperationError);
    expect(states).toContain("failed");
  });

  test("dispose is idempotent and completes adapter-owned streams", async () => {
    const server = new ControlledWebSocketServer();
    const transport = await openTransport(server);
    const complete = vi.fn();
    const next = vi.fn();
    transport.messages$.subscribe({ next, complete });

    const first = transport.dispose();
    const second = transport.dispose();
    expect(second).toBe(first);
    server.sockets.latest.acknowledgeClose();
    await first;

    expect(complete).toHaveBeenCalledOnce();
    server.sockets.latest.message(["NOTICE", "late"]);
    expect(next).not.toHaveBeenCalled();
  });
});
