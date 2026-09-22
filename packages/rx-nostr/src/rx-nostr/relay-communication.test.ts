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
    server.latestConnection.open();
    await vi.waitFor(() =>
      expect(directory.get(relay.url)).toMatchObject({
        lastConnectedAt: 1,
        liveConnections: 1,
      }),
    );

    now = 2;
    server.latestConnection.peerClose(1000, "restart", true);
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
    server.latestConnection.open();
    await vi.waitFor(() =>
      expect(directory.get(relay.url)).toMatchObject({
        lastConnectedAt: 3,
        consecutiveFailures: 0,
        liveConnections: 1,
      }),
    );

    release();
    await vi.waitFor(() => expect(server.latestConnection.closeRequests).toHaveLength(1));
    server.latestConnection.acknowledgeClose();
    await vi.waitFor(() => expect(directory.get(relay.url)?.liveConnections).toBe(0));
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
    server.latestConnection.open();
    const events: string[] = [];
    const complete = vi.fn();

    const subscription = relay.vreq("forward", [{ kinds: [1], since: () => 10 }]).subscribe({
      next: (packet) => events.push(packet.event.id),
      complete,
    });
    await vi.waitFor(() => expect(server.latestConnection.sent).toHaveLength(1));
    const req = JSON.parse(server.latestConnection.sent[0] as string) as ["REQ", string, object];
    expect(req[0]).toBe("REQ");
    expect(req[2]).toEqual({ kinds: [1], since: 10 });

    server.latestConnection.message(
      JSON.stringify(["EVENT", req[1], Faker.event({ id: "event" })]),
    );
    expect(events).toEqual(["event"]);

    subscription.unsubscribe();
    await vi.waitFor(() => expect(server.latestConnection.sent).toHaveLength(2));
    expect(JSON.parse(server.latestConnection.sent[1] as string)).toEqual(["CLOSE", req[1]]);
    expect(complete).not.toHaveBeenCalled();

    release();
    await vi.waitFor(() => expect(server.latestConnection.closeRequests).toHaveLength(1));
    server.latestConnection.acknowledgeClose();
  });

  test("backward REQ completes on EOSE and does not expose its subId", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
    });
    const release = relay.hold();
    server.latestConnection.open();
    const packets: object[] = [];
    const complete = vi.fn();

    relay.vreq("backward", [{}]).subscribe({
      next: (packet) => packets.push(packet),
      complete,
    });
    await vi.waitFor(() => expect(server.latestConnection.sent).toHaveLength(1));
    const [, subId] = JSON.parse(server.latestConnection.sent[0] as string) as ["REQ", string];
    server.latestConnection.message(JSON.stringify(["EVENT", subId, Faker.event({ id: "event" })]));
    server.latestConnection.message(JSON.stringify(["EOSE", subId]));

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
    await vi.waitFor(() => expect(server.latestConnection.closeRequests).toHaveLength(1));
    server.latestConnection.acknowledgeClose();
  });

  test("re-evaluates lazy filters when a REQ is resent after reconnect", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
      retryer: { retry: () => ({ action: "retry", delay: 0 }) },
    });
    const release = relay.hold();
    server.latestConnection.open();
    let since = 1;
    const subscription = relay.vreq("forward", [{ since: () => since }]).subscribe();
    await vi.waitFor(() => expect(server.latestConnection.sent).toHaveLength(1));
    expect(JSON.parse(server.latestConnection.sent[0] as string)[2]).toMatchObject({
      since: 1,
    });

    server.latestConnection.peerClose(1006, "offline");
    since = 2;
    await vi.waitFor(() => expect(server.connections).toHaveLength(2));
    server.latestConnection.open();
    await vi.waitFor(() => expect(server.latestConnection.sent).toHaveLength(1));
    expect(JSON.parse(server.latestConnection.sent[0] as string)[2]).toMatchObject({
      since: 2,
    });

    subscription.unsubscribe();
    await vi.waitFor(() => expect(server.latestConnection.sent).toHaveLength(2));
    release();
    await vi.waitFor(() => expect(server.latestConnection.closeRequests).toHaveLength(1));
    server.latestConnection.acknowledgeClose();
  });

  test("filters mismatched events and does not CLOSE a remotely terminated REQ", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
    });
    const release = relay.hold();
    server.latestConnection.open();
    const events: string[] = [];
    const complete = vi.fn();
    relay
      .vreq("backward", [{ kinds: [1] }], {
        validateFilterMatching: true,
      })
      .subscribe({
        next: (packet) => events.push(packet.event.id),
        complete,
      });
    await vi.waitFor(() => expect(server.latestConnection.sent).toHaveLength(1));
    const [, subId] = JSON.parse(server.latestConnection.sent[0] as string) as ["REQ", string];

    server.latestConnection.message(
      JSON.stringify(["EVENT", subId, Faker.event({ id: "wrong", kind: 2 })]),
    );
    server.latestConnection.message(
      JSON.stringify(["EVENT", subId, Faker.event({ id: "right", kind: 1 })]),
    );
    server.latestConnection.message(JSON.stringify(["EOSE", subId]));
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(events).toEqual(["right"]);
    expect(server.latestConnection.sent).toHaveLength(1);

    release();
    await vi.waitFor(() => expect(server.latestConnection.closeRequests).toHaveLength(1));
    server.latestConnection.acknowledgeClose();
  });

  test("treats a backward timeout as relay-local completion and sends CLOSE", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
    });
    const release = relay.hold();
    server.latestConnection.open();
    const complete = vi.fn();
    const error = vi.fn();
    relay.vreq("backward", [{}], { timeout: 5 }).subscribe({
      complete,
      error,
    });

    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(error).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(server.latestConnection.sent).toHaveLength(2));
    const [req, close] = server.latestConnection.sent.map((value) => JSON.parse(value as string));
    expect(close).toEqual(["CLOSE", req[1]]);

    release();
    await vi.waitFor(() => expect(server.latestConnection.closeRequests).toHaveLength(1));
    server.latestConnection.acknowledgeClose();
  });

  test("queues physical REQs at the NIP-11 max_subscriptions limit", async () => {
    const server = new ControlledWebSocketServer();
    const directory = new RelayDirectory();
    directory.setNip11("wss://relay.example.com", {
      limitation: { max_subscriptions: 1 },
    });
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
      relayDirectory: directory,
    });
    const release = relay.hold();
    server.latestConnection.open();
    const firstComplete = vi.fn();
    const secondComplete = vi.fn();
    relay.vreq("backward", [{ kinds: [1] }]).subscribe({
      complete: firstComplete,
    });
    relay.vreq("backward", [{ kinds: [2] }]).subscribe({
      complete: secondComplete,
    });
    const cancelled = relay.vreq("backward", [{ kinds: [3] }]).subscribe();
    cancelled.unsubscribe();
    await vi.waitFor(() => expect(server.latestConnection.sent).toHaveLength(1));
    const first = JSON.parse(server.latestConnection.sent[0] as string) as ["REQ", string];
    server.latestConnection.message(JSON.stringify(["EOSE", first[1]]));

    await vi.waitFor(() => expect(server.latestConnection.sent).toHaveLength(2));
    expect(firstComplete).toHaveBeenCalledOnce();
    const second = JSON.parse(server.latestConnection.sent[1] as string) as [
      "REQ",
      string,
      { kinds: number[] },
    ];
    expect(second[2]).toMatchObject({ kinds: [2] });
    server.latestConnection.message(JSON.stringify(["EOSE", second[1]]));
    await vi.waitFor(() => expect(secondComplete).toHaveBeenCalledOnce());
    expect(server.latestConnection.sent).toHaveLength(2);

    release();
    await vi.waitFor(() => expect(server.latestConnection.closeRequests).toHaveLength(1));
    server.latestConnection.acknowledgeClose();
  });

  test("dispose completes queued REQs without starting them", async () => {
    const server = new ControlledWebSocketServer();
    const directory = new RelayDirectory();
    directory.setNip11("wss://relay.example.com", {
      limitation: { max_subscriptions: 1 },
    });
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
      relayDirectory: directory,
    });
    relay.hold();
    server.latestConnection.open();
    const firstComplete = vi.fn();
    const queuedComplete = vi.fn();
    relay.vreq("backward", [{ kinds: [1] }]).subscribe({
      complete: firstComplete,
    });
    const queued = relay.vreq("backward", [{ kinds: [2] }]);
    queued.subscribe({ complete: queuedComplete });
    await vi.waitFor(() => expect(server.latestConnection.sent).toHaveLength(1));

    relay.dispose();

    expect(firstComplete).toHaveBeenCalledOnce();
    expect(queuedComplete).toHaveBeenCalledOnce();
    expect(
      server.latestConnection.sent
        .map((value) => JSON.parse(value as string))
        .filter(([type]) => type === "REQ"),
    ).toHaveLength(1);
    queued.subscribe({ complete: queuedComplete });
    expect(queuedComplete).toHaveBeenCalledTimes(2);
  });

  test("wraps a lazy filter exception without sending a REQ or CLOSE", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
    });
    const release = relay.hold();
    server.latestConnection.open();
    const cause = new Error("filter failed");
    let received: unknown;
    relay
      .vreq("backward", [
        {
          since: () => {
            throw cause;
          },
        },
      ])
      .subscribe({ error: (error) => (received = error) });

    await vi.waitFor(() => expect(received).toBeDefined());
    expect(received).toMatchObject({
      name: "RxNostrCallbackError",
      callback: "filter",
      cause,
    });
    expect(server.latestConnection.sent).toEqual([]);

    release();
    await vi.waitFor(() => expect(server.latestConnection.closeRequests).toHaveLength(1));
    server.latestConnection.acknowledgeClose();
  });

  test("sends EVENT and maps the matching OK", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
    });
    const release = relay.hold();
    server.latestConnection.open();
    const event = Faker.event({ id: "event" });
    const packets: object[] = [];

    relay.event(event).subscribe((packet) => packets.push(packet));
    await vi.waitFor(() => expect(server.latestConnection.sent).toHaveLength(1));
    expect(JSON.parse(server.latestConnection.sent[0] as string)).toEqual(["EVENT", event]);
    server.latestConnection.message('["OK","event",true,"saved"]');

    expect(packets).toEqual([
      {
        from: "wss://relay.example.com",
        type: "OK",
        eventId: "event",
        ok: true,
        notice: "saved",
        message: ["OK", "event", true, "saved"],
      },
    ]);
    release();
    await vi.waitFor(() => expect(server.latestConnection.closeRequests).toHaveLength(1));
    server.latestConnection.acknowledgeClose();
  });

  test("authenticates and resends an EVENT once after auth-required", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
    });
    const release = relay.hold();
    server.latestConnection.open();
    const event = Faker.event({ id: "event" });
    const authEvent = {
      ...Faker.event({
        id: "auth-event",
        kind: 22242,
        tags: [
          ["relay", relay.url],
          ["challenge", "challenge"],
        ],
      }),
      kind: 22242 as const,
    };
    const packets: object[] = [];
    const complete = vi.fn();
    relay
      .event(event, {
        authenticator: { authTimeout: 1_000, challenge: async () => authEvent },
      })
      .subscribe({ next: (packet) => packets.push(packet), complete });
    await vi.waitFor(() => expect(server.latestConnection.sent).toHaveLength(1));
    server.latestConnection.message(JSON.stringify(["AUTH", "challenge"]));
    server.latestConnection.message(JSON.stringify(["OK", "event", false, "auth-required: login"]));

    await vi.waitFor(() => expect(server.latestConnection.sent).toHaveLength(2));
    expect(JSON.parse(server.latestConnection.sent[1] as string)).toEqual(["AUTH", authEvent]);
    server.latestConnection.message(JSON.stringify(["OK", "auth-event", true, "authenticated"]));
    await vi.waitFor(() => expect(server.latestConnection.sent).toHaveLength(3));
    expect(JSON.parse(server.latestConnection.sent[2] as string)).toEqual(["EVENT", event]);
    server.latestConnection.message(JSON.stringify(["OK", "event", true, "saved"]));

    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(packets).toEqual([
      {
        from: relay.url,
        type: "OK",
        eventId: "event",
        ok: false,
        notice: "auth-required: login",
        noticeType: "auth-required",
        message: ["OK", "event", false, "auth-required: login"],
      },
      {
        from: relay.url,
        type: "OK",
        eventId: "event",
        ok: true,
        notice: "saved",
        message: ["OK", "event", true, "saved"],
      },
    ]);
    release();
    await vi.waitFor(() => expect(server.latestConnection.closeRequests).toHaveLength(1));
    server.latestConnection.acknowledgeClose();
  });

  test("coalesces rapid release and reacquire without a socket blink", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
    });
    const first = relay.hold();
    server.latestConnection.open();
    await Promise.resolve();

    first();
    const second = relay.hold();
    await Promise.resolve();

    expect(server.connections).toHaveLength(1);
    expect(server.latestConnection.closeRequests).toHaveLength(0);
    expect(relay.leaseCount).toBe(1);

    second();
    second();
    await vi.waitFor(() => expect(server.latestConnection.closeRequests).toHaveLength(1));
    expect(relay.leaseCount).toBe(0);
    server.latestConnection.acknowledgeClose();
  });

  test("dispose invalidates outstanding lease callbacks", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
    });
    const release = relay.hold();
    server.latestConnection.open();
    await Promise.resolve();

    relay.dispose();
    expect(server.latestConnection.closeRequests).toHaveLength(1);
    release();
    release();
    await Promise.resolve();

    expect(relay.leaseCount).toBe(0);
    expect(server.latestConnection.closeRequests).toHaveLength(1);
    server.latestConnection.acknowledgeClose();
  });
});
