import { map } from "rxjs";
import { describe, expect, test, vi } from "vitest";

import { ControlledWebSocketServer, createDeferred, Faker } from "../../__test__/helper/index.ts";
import { SubscriptionInspector } from "../../__test__/helper/subscription-inspector.ts";
import { NoopReconnector } from "../../connection-reconnector/index.ts";
import type { EventPacket } from "../../packets/packets.interface.ts";
import { RelayDirectory } from "../../relay-directory/index.ts";
import { RelayCommunication } from "./relay-communication.ts";

describe("RelayCommunication transport integration", () => {
  test("starts NIP-11 retrieval on connection demand and holds REQs until it settles", async () => {
    const server = new ControlledWebSocketServer();
    const response = createDeferred<{ limitation: { max_subscriptions: number } }>();
    const fetcher = vi.fn(() => response.promise);
    const directory = new RelayDirectory({ fetcher });
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
      relayDirectory: directory,
      nip11Timeout: 1_000,
    });

    expect(fetcher).not.toHaveBeenCalled();
    const release = relay.hold();
    expect(fetcher).toHaveBeenCalledOnce();
    const socket = server.sockets.latest;
    socket.open();
    const firstInspector = new SubscriptionInspector<EventPacket>();
    relay.vreq("backward", [{ kinds: [1] }]).subscribe(firstInspector);
    const secondInspector = new SubscriptionInspector<EventPacket>();
    relay.vreq("backward", [{ kinds: [2] }]).subscribe(secondInspector);
    await Promise.resolve();
    expect(socket.inbox.length).toBe(0);

    response.resolve({ limitation: { max_subscriptions: 1 } });
    const first = await socket.inbox.waitNext("REQ");
    expect(first[2]).toMatchObject({ kinds: [1] });
    expect(socket.inbox.length).toBe(1);
    socket.message(["EOSE", first[1]]);
    const second = await socket.inbox.waitNext("REQ");
    expect(second[2]).toMatchObject({ kinds: [2] });
    socket.message(["EOSE", second[1]]);

    release();
    await expect(socket.closeRequested).resolves.toBeDefined();
    socket.acknowledgeClose();
  });

  test("uses empty NIP-11 metadata after retrieval fails", async () => {
    const server = new ControlledWebSocketServer();
    const directory = new RelayDirectory({ fetcher: () => Promise.reject(new Error("offline")) });
    const diagnostic = vi.fn();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
      relayDirectory: directory,
      nip11Timeout: 1_000,
      onDiagnostic: diagnostic,
    });
    const release = relay.hold();
    const socket = server.sockets.latest;
    socket.open();
    const inspector = new SubscriptionInspector<EventPacket>();
    relay.vreq("backward", [{}]).subscribe(inspector);

    const req = await socket.inbox.waitNext("REQ");
    expect(directory.get(relay.url)?.nip11FailedAt).toBeTypeOf("number");
    expect(diagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Automatic NIP-11 relay information retrieval failed." }),
    );
    socket.message(["EOSE", req[1]]);
    release();
    await expect(socket.closeRequested).resolves.toBeDefined();
    socket.acknowledgeClose();
  });

  test("reports the same lifecycle to RelayDirectory health", async () => {
    let now = 1;
    const server = new ControlledWebSocketServer();
    const directory = new RelayDirectory({ clock: () => now });
    const reconnect = vi.fn(() => ({ action: "retry", delay: 0 }) as const);
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
      reconnector: { reconnect },
      relayDirectory: directory,
    });
    const release = relay.hold();
    const socket = server.sockets.latest;
    socket.open();
    await vi.waitFor(() =>
      expect(directory.get(relay.url)).toMatchObject({
        lastConnectedAt: 1,
        liveConnections: 1,
      }),
    );

    now = 2;
    socket.peerClose(1000, "restart", true);
    await expect(server.connections.wait(1)).resolves.toBeDefined();
    expect(directory.get(relay.url)).toMatchObject({
      lastFailureAt: 2,
      consecutiveFailures: 1,
      liveConnections: 0,
    });
    expect(reconnect).toHaveBeenCalledWith(
      expect.objectContaining({
        health: {
          consecutiveFailures: 1,
          firstFailureAt: 2,
          liveConnections: 0,
          lastConnectedAt: 1,
          lastFailureAt: 2,
        },
      }),
    );

    now = 3;
    const socket2 = server.sockets.latest;
    socket2.open();
    await vi.waitFor(() =>
      expect(directory.get(relay.url)).toMatchObject({
        lastConnectedAt: 3,
        consecutiveFailures: 0,
        liveConnections: 1,
      }),
    );

    release();
    await expect(socket2.closeRequested).resolves.toBeDefined();
    socket2.acknowledgeClose();
    await vi.waitFor(() => expect(directory.get(relay.url)?.liveConnections).toBe(0));
    expect(directory.get(relay.url)?.lastFailureAt).toBe(2);
  });

  test("does not create a connection for a weak/disconnected operation", () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
    });
    const inspector = new SubscriptionInspector<EventPacket>();

    relay.vreq("forward", [{}]).subscribe(inspector);

    expect(inspector.completed).toBe(true);
    expect(server.connections).toHaveLength(0);
    relay.dispose();
  });

  test("sends REQ and sends protocol CLOSE before ending the local stream", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
      reconnector: new NoopReconnector(),
    });
    const release = relay.hold();
    const socket = server.sockets.latest;
    socket.open();
    const inspector = new SubscriptionInspector<string>();

    const subscription = relay
      .vreq("forward", [{ kinds: [1], since: () => 10 }])
      .pipe(map((packet) => packet.event.id))
      .subscribe(inspector);
    const req = await socket.inbox.waitNext("REQ");
    expect(req[0]).toBe("REQ");
    expect(req[2]).toEqual({ kinds: [1], since: 10 });

    socket.message(["EVENT", req[1], Faker.event({ id: "event" })]);
    await expect(inspector.waitNext()).resolves.toEqual("event");

    subscription.unsubscribe();
    expect(await socket.inbox.waitNext("CLOSE")).toEqual(["CLOSE", req[1]]);
    expect(inspector.completed).toBe(false);

    release();
    await expect(socket.closeRequested).resolves.toBeDefined();
    socket.acknowledgeClose();
  });

  test("backward REQ completes on EOSE", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
    });
    const release = relay.hold();
    const socket = server.sockets.latest;
    socket.open();
    const inspector = new SubscriptionInspector<object>();

    relay.vreq("backward", [{}]).subscribe(inspector);
    const [, subId] = await socket.inbox.waitNext("REQ");
    socket.message(["EVENT", subId, Faker.event({ id: "event" })]);
    socket.message(["EOSE", subId]);

    await vi.waitFor(() => expect(inspector.completed).toBe(true));
    await expect(inspector.waitNext()).resolves.toEqual({
      from: "wss://relay.example.com",
      type: "EVENT",
      event: Faker.event({ id: "event" }),
    });

    release();
    await expect(socket.closeRequested).resolves.toBeDefined();
    socket.acknowledgeClose();
  });

  test("re-evaluates lazy filters when a REQ is resent after reconnect", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
      reconnector: { reconnect: () => ({ action: "retry", delay: 0 }) },
    });
    const release = relay.hold();
    const socket = server.sockets.latest;
    socket.open();
    let since = 1;
    const inspector = new SubscriptionInspector<EventPacket>();
    const subscription = relay.vreq("forward", [{ since: () => since }]).subscribe(inspector);
    const first = await socket.inbox.waitNext("REQ");
    expect(first[2]).toMatchObject({
      since: 1,
    });

    socket.peerClose(1006, "offline");
    since = 2;
    await expect(server.connections.wait(1)).resolves.toBeDefined();
    const socket2 = server.sockets.latest;
    socket2.open();
    const resent = await socket2.inbox.waitNext("REQ");
    expect(resent[2]).toMatchObject({
      since: 2,
    });

    subscription.unsubscribe();
    await expect(socket2.inbox.waitNext()).resolves.toEqual(["CLOSE", resent[1]]);
    release();
    await expect(socket2.closeRequested).resolves.toBeDefined();
    socket2.acknowledgeClose();
  });

  test("filters mismatched events and does not CLOSE a remotely terminated REQ", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
    });
    const release = relay.hold();
    const socket = server.sockets.latest;
    socket.open();
    const inspector = new SubscriptionInspector<string>();

    relay
      .vreq("backward", [{ kinds: [1] }], {
        validateFilterMatching: true,
      })
      .pipe(map((packet) => packet.event.id))
      .subscribe(inspector);
    const [, subId] = await socket.inbox.waitNext("REQ");

    socket.message(["EVENT", subId, Faker.event({ id: "wrong", kind: 2 })]);
    socket.message(["EVENT", subId, Faker.event({ id: "right", kind: 1 })]);
    socket.message(["EOSE", subId]);
    await vi.waitFor(() => expect(inspector.completed).toBe(true));
    await expect(inspector.waitNext()).resolves.toEqual("right");
    expect(socket.inbox.length).toBe(1);

    release();
    await expect(socket.closeRequested).resolves.toBeDefined();
    socket.acknowledgeClose();
  });

  test("treats a backward timeout as relay-local completion and sends CLOSE", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
    });
    const release = relay.hold();
    const socket = server.sockets.latest;
    socket.open();
    const inspector = new SubscriptionInspector<EventPacket>();

    relay.vreq("backward", [{}], { timeout: 5 }).subscribe(inspector);

    await vi.waitFor(() => expect(inspector.completed).toBe(true));
    expect(inspector.errored).toBe(false);
    const req = await socket.inbox.waitNext("REQ");
    const close = await socket.inbox.waitNext("CLOSE");
    expect(close).toEqual(["CLOSE", req[1]]);

    release();
    await expect(socket.closeRequested).resolves.toBeDefined();
    socket.acknowledgeClose();
  });

  test("queues REQs at the NIP-11 max_subscriptions limit", async () => {
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
    const socket = server.sockets.latest;
    socket.open();
    const firstInspector = new SubscriptionInspector<EventPacket>();
    const secondInspector = new SubscriptionInspector<EventPacket>();

    relay.vreq("backward", [{ kinds: [1] }]).subscribe(firstInspector);

    relay.vreq("backward", [{ kinds: [2] }]).subscribe(secondInspector);
    const thirdInspector = new SubscriptionInspector<EventPacket>();
    const cancelled = relay.vreq("backward", [{ kinds: [3] }]).subscribe(thirdInspector);
    cancelled.unsubscribe();
    const first = await socket.inbox.waitNext("REQ");
    socket.message(["EOSE", first[1]]);

    const second = await socket.inbox.waitNext("REQ");
    expect(firstInspector.completed).toBe(true);
    expect(second[2]).toMatchObject({ kinds: [2] });
    socket.message(["EOSE", second[1]]);
    await vi.waitFor(() => expect(secondInspector.completed).toBe(true));
    expect(socket.inbox.length).toBe(2);

    release();
    await expect(socket.closeRequested).resolves.toBeDefined();
    socket.acknowledgeClose();
  });

  test("starts a backward timeout only after its REQ leaves the queue", async () => {
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
    const socket = server.sockets.latest;
    socket.open();
    const firstInspector = new SubscriptionInspector<EventPacket>();
    const secondInspector = new SubscriptionInspector<EventPacket>();
    const thirdInspector = new SubscriptionInspector<EventPacket>();
    relay.vreq("backward", [{ kinds: [1] }]).subscribe(thirdInspector);

    relay.vreq("backward", [{ kinds: [2] }], { timeout: 10 }).subscribe(firstInspector);

    relay.vreq("backward", [{ kinds: [3] }]).subscribe(secondInspector);

    const first = await socket.inbox.waitNext("REQ");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(firstInspector.completed).toBe(false);
    expect(socket.inbox.length).toBe(1);

    socket.message(["EOSE", first[1]]);
    const second = await socket.inbox.waitNext("REQ");
    expect(second[2]).toMatchObject({ kinds: [2] });
    await vi.waitFor(() => expect(firstInspector.completed).toBe(true));
    expect(await socket.inbox.waitNext("CLOSE")).toEqual(["CLOSE", second[1]]);
    const third = await socket.inbox.waitNext("REQ");
    expect(third[2]).toMatchObject({ kinds: [3] });
    expect(socket.inbox.length).toBe(4);
    socket.message(["EOSE", third[1]]);
    await vi.waitFor(() => expect(secondInspector.completed).toBe(true));

    release();
    await expect(socket.closeRequested).resolves.toBeDefined();
    socket.acknowledgeClose();
  });

  test("keeps a REQ slot reserved while unipls reconnects and resends it", async () => {
    const server = new ControlledWebSocketServer();
    const directory = new RelayDirectory();
    directory.setNip11("wss://relay.example.com", {
      limitation: { max_subscriptions: 1 },
    });
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
      relayDirectory: directory,
      reconnector: { reconnect: () => ({ action: "retry", delay: 0 }) },
    });
    const release = relay.hold();
    const socket = server.sockets.latest;
    socket.open();
    const firstInspector = new SubscriptionInspector<EventPacket>();
    const secondInspector = new SubscriptionInspector<EventPacket>();

    relay.vreq("backward", [{ kinds: [1] }]).subscribe(firstInspector);

    relay.vreq("backward", [{ kinds: [2] }]).subscribe(secondInspector);

    const initial = await socket.inbox.waitNext("REQ");
    socket.peerClose(1006, "offline");
    await expect(server.connections.wait(1)).resolves.toBeDefined();
    const socket2 = server.sockets.latest;
    socket2.open();

    const resent = await socket2.inbox.waitNext("REQ");
    expect(resent[1]).toBe(initial[1]);
    expect(resent[2]).toMatchObject({ kinds: [1] });
    expect(socket2.inbox.length).toBe(1);
    socket2.message(["EOSE", resent[1]]);

    const second = await socket2.inbox.waitNext("REQ");
    expect(second[2]).toMatchObject({ kinds: [2] });
    socket2.message(["EOSE", second[1]]);
    await vi.waitFor(() => expect(secondInspector.completed).toBe(true));
    expect(firstInspector.completed).toBe(true);

    release();
    await expect(socket2.closeRequested).resolves.toBeDefined();
    socket2.acknowledgeClose();
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
    const socket = server.sockets.latest;
    socket.open();
    const firstInspector = new SubscriptionInspector<EventPacket>();
    const secondInspector = new SubscriptionInspector<EventPacket>();

    relay.vreq("backward", [{ kinds: [1] }]).subscribe(firstInspector);
    const queued = relay.vreq("backward", [{ kinds: [2] }]);
    const thirdInspector = new SubscriptionInspector<EventPacket>();
    queued.subscribe(thirdInspector);
    const active = await socket.inbox.waitNext("REQ");

    relay.dispose();

    expect(firstInspector.completed).toBe(true);
    expect(thirdInspector.completed).toBe(true);
    await expect(socket.inbox.waitNext()).resolves.toEqual(["CLOSE", active[1]]);
    expect(socket.inbox.length).toBe(2);

    queued.subscribe(secondInspector);
    expect(secondInspector.completed).toBe(true);
  });

  test("wraps a lazy filter exception without sending a REQ or CLOSE", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
    });
    const release = relay.hold();
    const socket = server.sockets.latest;
    socket.open();
    const cause = new Error("filter failed");
    const inspector = new SubscriptionInspector<EventPacket>();
    relay
      .vreq("backward", [
        {
          since: () => {
            throw cause;
          },
        },
      ])
      .subscribe(inspector);

    await expect(inspector.waitError()).resolves.toMatchObject({
      name: "RxNostrCallbackError",
      callback: "filter",
      cause,
    });
    expect(socket.inbox.length).toBe(0);

    release();
    await expect(socket.closeRequested).resolves.toBeDefined();
    socket.acknowledgeClose();
  });

  test("sends EVENT and maps the matching OK", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
    });
    const release = relay.hold();
    const socket = server.sockets.latest;
    socket.open();
    const event = Faker.event({ id: "event" });
    const inspector = new SubscriptionInspector<object>();

    relay.event(event).subscribe(inspector);
    expect(await socket.inbox.waitNext("EVENT")).toEqual(["EVENT", event]);
    socket.message(["OK", "event", true, "saved"]);

    await expect(inspector.waitNext()).resolves.toEqual({
      from: "wss://relay.example.com",
      type: "OK",
      eventId: "event",
      ok: true,
      notice: "saved",
      message: ["OK", "event", true, "saved"],
    });
    release();
    await expect(socket.closeRequested).resolves.toBeDefined();
    socket.acknowledgeClose();
  });

  test("authenticates and resends an EVENT once after auth-required", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
      authenticator: { authTimeout: 1_000, challenge: async () => authEvent },
    });
    const release = relay.hold();
    const socket = server.sockets.latest;
    socket.open();
    const event = Faker.event({ id: "event" });
    const authEvent = Faker.authEvent({
      id: "auth-event",
      relay: relay.url,
      challenge: "challenge",
    });
    const inspector = new SubscriptionInspector<object>();

    relay.event(event).subscribe(inspector);
    await expect(socket.inbox.waitNext()).resolves.toHaveProperty("0", "EVENT");
    socket.message(["AUTH", "challenge"]);
    socket.message(["OK", "event", false, "auth-required: login"]);

    expect(await socket.inbox.waitNext("AUTH")).toEqual(["AUTH", authEvent]);
    socket.message(["OK", "auth-event", true, "authenticated"]);
    expect(await socket.inbox.waitNext("EVENT")).toEqual(["EVENT", event]);
    socket.message(["OK", "event", true, "saved"]);

    await vi.waitFor(() => expect(inspector.completed).toBe(true));
    await expect(inspector.waitNext()).resolves.toEqual({
      from: relay.url,
      type: "OK",
      eventId: "event",
      ok: false,
      notice: "auth-required: login",
      noticeType: "auth-required",
      message: ["OK", "event", false, "auth-required: login"],
    });
    await expect(inspector.waitNext()).resolves.toEqual({
      from: relay.url,
      type: "OK",
      eventId: "event",
      ok: true,
      notice: "saved",
      message: ["OK", "event", true, "saved"],
    });
    release();
    await expect(socket.closeRequested).resolves.toBeDefined();
    socket.acknowledgeClose();
  });

  test("coalesces rapid release and reacquire without a socket blink", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
    });
    const first = relay.hold();
    const socket = server.sockets.latest;
    socket.open();
    await Promise.resolve();

    first();
    const second = relay.hold();
    await Promise.resolve();

    expect(server.connections).toHaveLength(1);
    expect(socket.isCloseRequested).toBe(false);
    expect(relay.leaseCount).toBe(1);

    second();
    second();
    await expect(socket.closeRequested).resolves.toBeDefined();
    expect(relay.leaseCount).toBe(0);
    socket.acknowledgeClose();
  });

  test("dispose invalidates outstanding lease callbacks", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
    });
    const release = relay.hold();
    const socket = server.sockets.latest;
    socket.open();
    await Promise.resolve();

    relay.dispose();
    expect(socket.isCloseRequested).toBe(true);
    release();
    release();
    await Promise.resolve();

    expect(relay.leaseCount).toBe(0);
    expect(socket.isCloseRequested).toBe(true);
    socket.acknowledgeClose();
  });
});
