import { describe, expect, test, vi } from "vitest";
import { ControlledWebSocketServer, Faker } from "../__test__/helper/index.ts";
import { NoopRetryer } from "../connection-retryer/index.ts";
import { RelayDirectory } from "../relay-directory/index.ts";
import { RelayCommunication } from "./relay-communication.ts";

describe("RelayCommunication transport integration", () => {
  test("reports the same lifecycle to RelayDirectory health", async () => {
    let now = 1;
    const server = new ControlledWebSocketServer();
    const directory = new RelayDirectory({ clock: () => now });
    const retry = vi.fn(() => ({ action: "retry", delay: 0 }) as const);
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
      retryer: { retry },
      relayDirectory: directory,
    });
    const release = relay.hold();
    server.current.open();
    await vi.waitFor(() =>
      expect(directory.get(relay.url)).toMatchObject({
        lastConnectedAt: 1,
        liveConnections: 1,
      }),
    );

    now = 2;
    server.current.peerClose(1000, "restart", true);
    await vi.waitFor(() => expect(server.connections).toHaveLength(2));
    expect(directory.get(relay.url)).toMatchObject({
      lastFailureAt: 2,
      consecutiveFailures: 1,
      liveConnections: 0,
    });
    expect(retry).toHaveBeenCalledWith(
      expect.objectContaining({
        health: {
          consecutiveFailures: 1,
          lastConnectedAt: 1,
          lastFailureAt: 2,
        },
      }),
    );

    now = 3;
    server.current.open();
    await vi.waitFor(() =>
      expect(directory.get(relay.url)).toMatchObject({
        lastConnectedAt: 3,
        consecutiveFailures: 0,
        liveConnections: 1,
      }),
    );

    release();
    await vi.waitFor(() =>
      expect(server.current.closeRequests).toHaveLength(1),
    );
    server.current.acknowledgeClose();
    await vi.waitFor(() =>
      expect(directory.get(relay.url)?.liveConnections).toBe(0),
    );
    expect(directory.get(relay.url)?.lastFailureAt).toBe(2);
  });

  test("does not create a connection for a weak/disconnected operation", () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
    });
    const complete = vi.fn();

    relay.vreq("forward", [{}]).subscribe({ complete });

    expect(complete).toHaveBeenCalledOnce();
    expect(server.connections).toHaveLength(0);
    relay.dispose();
  });

  test("sends REQ and sends protocol CLOSE before ending the local stream", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
      retryer: new NoopRetryer(),
    });
    const release = relay.hold();
    server.current.open();
    const events: string[] = [];
    const complete = vi.fn();

    const subscription = relay
      .vreq("forward", [{ kinds: [1], since: () => 10 }])
      .subscribe({
        next: (packet) => events.push(packet.event.id),
        complete,
      });
    await vi.waitFor(() => expect(server.current.sent).toHaveLength(1));
    const req = JSON.parse(server.current.sent[0] as string) as [
      "REQ",
      string,
      object,
    ];
    expect(req[0]).toBe("REQ");
    expect(req[2]).toEqual({ kinds: [1], since: 10 });

    server.current.message(
      JSON.stringify(["EVENT", req[1], Faker.event({ id: "event" })]),
    );
    expect(events).toEqual(["event"]);

    subscription.unsubscribe();
    await vi.waitFor(() => expect(server.current.sent).toHaveLength(2));
    expect(JSON.parse(server.current.sent[1] as string)).toEqual([
      "CLOSE",
      req[1],
    ]);
    expect(complete).not.toHaveBeenCalled();

    release();
    await vi.waitFor(() =>
      expect(server.current.closeRequests).toHaveLength(1),
    );
    server.current.acknowledgeClose();
  });

  test("backward REQ completes on EOSE and does not expose its subId", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
    });
    const release = relay.hold();
    server.current.open();
    const packets: object[] = [];
    const complete = vi.fn();

    relay.vreq("backward", [{}]).subscribe({
      next: (packet) => packets.push(packet),
      complete,
    });
    await vi.waitFor(() => expect(server.current.sent).toHaveLength(1));
    const [, subId] = JSON.parse(server.current.sent[0] as string) as [
      "REQ",
      string,
    ];
    server.current.message(
      JSON.stringify(["EVENT", subId, Faker.event({ id: "event" })]),
    );
    server.current.message(JSON.stringify(["EOSE", subId]));

    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(packets).toEqual([
      {
        from: "wss://relay.example.com",
        type: "EVENT",
        event: Faker.event({ id: "event" }),
      },
    ]);
    expect(packets[0]).not.toHaveProperty("subId");
    expect(packets[0]).not.toHaveProperty("message");

    release();
    await vi.waitFor(() =>
      expect(server.current.closeRequests).toHaveLength(1),
    );
    server.current.acknowledgeClose();
  });

  test("sends EVENT and maps the matching OK", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
    });
    const release = relay.hold();
    server.current.open();
    const event = Faker.event({ id: "event" });
    const progress: object[] = [];

    relay.event(event).subscribe((packet) => progress.push(packet));
    await vi.waitFor(() => expect(server.current.sent).toHaveLength(1));
    expect(JSON.parse(server.current.sent[0] as string)).toEqual([
      "EVENT",
      event,
    ]);
    server.current.message('["OK","event",true,"saved"]');

    expect(progress).toEqual([
      { from: "wss://relay.example.com", state: "sent" },
      { from: "wss://relay.example.com", state: "ok", ok: true },
    ]);
    release();
    await vi.waitFor(() =>
      expect(server.current.closeRequests).toHaveLength(1),
    );
    server.current.acknowledgeClose();
  });

  test("coalesces rapid release and reacquire without a socket blink", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
    });
    const first = relay.hold();
    server.current.open();
    await Promise.resolve();

    first();
    const second = relay.hold();
    await Promise.resolve();

    expect(server.connections).toHaveLength(1);
    expect(server.current.closeRequests).toHaveLength(0);
    expect(relay.leaseCount).toBe(1);

    second();
    second();
    await vi.waitFor(() =>
      expect(server.current.closeRequests).toHaveLength(1),
    );
    expect(relay.leaseCount).toBe(0);
    server.current.acknowledgeClose();
  });

  test("dispose invalidates outstanding lease callbacks", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
    });
    const release = relay.hold();
    server.current.open();
    await Promise.resolve();

    relay.dispose();
    expect(server.current.closeRequests).toHaveLength(1);
    release();
    release();
    await Promise.resolve();

    expect(relay.leaseCount).toBe(0);
    expect(server.current.closeRequests).toHaveLength(1);
    server.current.acknowledgeClose();
  });
});
