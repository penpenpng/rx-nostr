import { firstValueFrom, toArray } from "rxjs";
import { describe, expect, test, vi } from "vitest";
import {
  ControlledWebSocketServer,
  Faker,
} from "../../__test__/helper/index.ts";
import type { ConnectionRetryer } from "../../connection-retryer/index.ts";
import {
  NostrTransport,
  NostrTransportOperationError,
} from "./nostr-transport.ts";

const relay = "wss://relay.example.com" as const;

async function openTransport(
  server: ControlledWebSocketServer,
  retryer?: ConnectionRetryer,
) {
  const transport = new NostrTransport({
    url: relay,
    WebSocket: server.WebSocket,
    retryer,
  });
  const opened = transport.open();
  server.current.open();
  await opened;
  return transport;
}

async function closeTransport(
  transport: NostrTransport,
  server: ControlledWebSocketServer,
) {
  const closed = transport.close();
  server.current.acknowledgeClose();
  await closed;
}

describe("NostrTransport", () => {
  test("opens, decodes messages, casts tuples, and closes by user", async () => {
    const server = new ControlledWebSocketServer();
    const transport = await openTransport(server);
    const messages: string[] = [];
    const states: string[] = [];
    transport.messages$.subscribe((packet) => messages.push(packet.type));
    transport.state$.subscribe((state) => states.push(state.state));

    server.current.message('["NOTICE","hello"]');
    await transport.cast(["CLOSE", "sub"]);

    expect(messages).toEqual(["NOTICE"]);
    expect(server.current.sent).toEqual(['["CLOSE","sub"]']);

    await closeTransport(transport, server);
    expect(states).toContain("closed");
  });

  test.each([
    "not-json",
    '["EVENT","missing-event"]',
    new Uint8Array([1, 2, 3]),
  ])(
    "reports invalid input as a diagnostic and keeps the session alive",
    async (input) => {
      const server = new ControlledWebSocketServer();
      const transport = await openTransport(server);
      const diagnostics: string[] = [];
      const messages: string[] = [];
      transport.diagnostics$.subscribe((value) => diagnostics.push(value.type));
      transport.messages$.subscribe((value) => messages.push(value.type));

      server.current.message(input);
      server.current.message('["NOTICE","still alive"]');

      await vi.waitFor(() =>
        expect(diagnostics).toEqual(["message-deserialization-failed"]),
      );
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
        terminator: (packet) =>
          packet.type === "EOSE" && packet.subId === "sub",
      })
      .subscribe({
        next: (packet) => received.push(packet.type),
        complete: () => completions++,
      });

    expect(server.current.sent).toEqual(['["REQ","sub",{}]']);
    await Promise.resolve();
    server.current.message(JSON.stringify(["EVENT", "sub", event]));
    server.current.message('["EOSE","sub"]');
    await vi.waitFor(() => expect(completions).toBe(1));
    expect(received).toEqual(["EVENT"]);

    subscription.unsubscribe();
    subscription.unsubscribe();
    expect(completions).toBe(1);
    expect(server.current.sent).toHaveLength(1);
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
    const dropped = firstValueFrom(
      dropTransport.listen({ retry: "fail" }).pipe(toArray()),
    );
    dropServer.current.peerClose(1006, "network lost");
    await expect(dropped).rejects.toMatchObject({
      name: "NostrTransportOperationError",
      reason: "dropped",
    });
  });

  test("reconnects and ignores delayed messages from an old transport epoch", async () => {
    const server = new ControlledWebSocketServer();
    const retryer: ConnectionRetryer = {
      retry: vi.fn(() => ({ action: "retry", delay: 0 }) as const),
    };
    const transport = await openTransport(server, retryer);
    const oldSocket = server.current;
    const messages: string[] = [];
    const states: string[] = [];
    transport.messages$.subscribe((packet) => messages.push(packet.type));
    transport.state$.subscribe((state) => states.push(state.state));

    oldSocket.peerClose(1006, "network lost");
    await vi.waitFor(() => expect(server.connections).toHaveLength(2));
    const newSocket = server.current;
    newSocket.open();
    await vi.waitFor(() => expect(retryer.retry).toHaveBeenCalledOnce());
    await vi.waitFor(() =>
      expect(states.filter((state) => state === "connected")).toHaveLength(1),
    );

    oldSocket.message('["NOTICE","stale"]');
    newSocket.message('["NOTICE","current"]');
    expect(messages).toEqual(["NOTICE"]);

    await closeTransport(transport, server);
  });

  test("applies the rx-nostr retry policy to an initial connection failure", async () => {
    const server = new ControlledWebSocketServer();
    const retryer: ConnectionRetryer = {
      retry: vi.fn(() => ({ action: "retry", delay: 0 }) as const),
    };
    const transport = new NostrTransport({
      url: relay,
      WebSocket: server.WebSocket,
      retryer,
    });

    const opened = transport.open();
    server.current.peerClose(1006, "initial failure");
    await vi.waitFor(() => expect(server.connections).toHaveLength(2));
    server.current.open();
    await opened;

    expect(retryer.retry).toHaveBeenCalledWith(
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
        retryer: { retry: () => ({ action }) },
      });

      const opened = transport.open();
      server.current.peerClose(1006, "initial failure");

      await expect(opened).rejects.toMatchObject({ name: "UniplsOpenError" });
      expect(server.connections).toHaveLength(1);
    },
  );

  test("classifies transport errors as drops", async () => {
    const server = new ControlledWebSocketServer();
    const transport = await openTransport(server);
    const states: string[] = [];
    transport.state$.subscribe((state) => states.push(state.state));
    const result = firstValueFrom(
      transport.listen({ retry: "fail" }).pipe(toArray()),
    );

    server.current.error(new Error("offline"));

    await expect(result).rejects.toBeInstanceOf(NostrTransportOperationError);
    expect(states).toContain("dropped");
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
    server.current.acknowledgeClose();
    await first;

    expect(complete).toHaveBeenCalledOnce();
    server.current.message('["NOTICE","late"]');
    expect(next).not.toHaveBeenCalled();
  });
});
