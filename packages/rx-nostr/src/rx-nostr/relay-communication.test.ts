import { describe, expect, test, vi } from "vitest";
import {
  ControlledWebSocketServer,
  createDeferred,
  expectSent,
  Faker,
} from "../__test__/helper/index.ts";
import { NoopReconnector } from "../connection-reconnector/index.ts";
import { RelayDirectory } from "../relay-directory/index.ts";
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
    server.sockets.latest.open();
    relay.vreq("backward", [{ kinds: [1] }]).subscribe();
    relay.vreq("backward", [{ kinds: [2] }]).subscribe();
    await Promise.resolve();
    expect(server.sockets.latest.sentOfType("REQ")).toHaveLength(0);

    response.resolve({ limitation: { max_subscriptions: 1 } });
    const first = await expectSent(server.sockets.latest, "REQ");
    expect(first[2]).toMatchObject({ kinds: [1] });
    expect(server.sockets.latest.sentOfType("REQ")).toHaveLength(1);
    server.sockets.latest.message(["EOSE", first[1]]);
    const second = await expectSent(server.sockets.latest, "REQ", 2);
    expect(second[2]).toMatchObject({ kinds: [2] });
    server.sockets.latest.message(["EOSE", second[1]]);

    release();
    await vi.waitFor(() => expect(server.sockets.latest.closeRequests).toHaveLength(1));
    server.sockets.latest.acknowledgeClose();
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
    server.sockets.latest.open();
    relay.vreq("backward", [{}]).subscribe();

    const req = await expectSent(server.sockets.latest, "REQ");
    expect(directory.get(relay.url)?.nip11FailedAt).toBeTypeOf("number");
    expect(diagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Automatic NIP-11 relay information retrieval failed." }),
    );
    server.sockets.latest.message(["EOSE", req[1]]);
    release();
    await vi.waitFor(() => expect(server.sockets.latest.closeRequests).toHaveLength(1));
    server.sockets.latest.acknowledgeClose();
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
    server.sockets.latest.open();
    await vi.waitFor(() =>
      expect(directory.get(relay.url)).toMatchObject({
        lastConnectedAt: 1,
        liveConnections: 1,
      }),
    );

    now = 2;
    server.sockets.latest.peerClose(1000, "restart", true);
    await vi.waitFor(() => expect(server.connections).toHaveLength(2));
    expect(directory.get(relay.url)).toMatchObject({
      lastFailureAt: 2,
      consecutiveFailures: 1,
      liveConnections: 0,
    });
    expect(reconnect).toHaveBeenCalledWith(
      expect.objectContaining({
        health: {
          consecutiveFailures: 1,
          lastConnectedAt: 1,
          lastFailureAt: 2,
        },
      }),
    );

    now = 3;
    server.sockets.latest.open();
    await vi.waitFor(() =>
      expect(directory.get(relay.url)).toMatchObject({
        lastConnectedAt: 3,
        consecutiveFailures: 0,
        liveConnections: 1,
      }),
    );

    release();
    await vi.waitFor(() => expect(server.sockets.latest.closeRequests).toHaveLength(1));
    server.sockets.latest.acknowledgeClose();
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
      reconnector: new NoopReconnector(),
    });
    const release = relay.hold();
    server.sockets.latest.open();
    const events: string[] = [];
    const complete = vi.fn();

    const subscription = relay.vreq("forward", [{ kinds: [1], since: () => 10 }]).subscribe({
      next: (packet) => events.push(packet.event.id),
      complete,
    });
    const req = await expectSent(server.sockets.latest, "REQ");
    expect(req[0]).toBe("REQ");
    expect(req[2]).toEqual({ kinds: [1], since: 10 });

    server.sockets.latest.message(["EVENT", req[1], Faker.event({ id: "event" })]);
    expect(events).toEqual(["event"]);

    subscription.unsubscribe();
    expect(await expectSent(server.sockets.latest, "CLOSE")).toEqual(["CLOSE", req[1]]);
    expect(complete).not.toHaveBeenCalled();

    release();
    await vi.waitFor(() => expect(server.sockets.latest.closeRequests).toHaveLength(1));
    server.sockets.latest.acknowledgeClose();
  });

  test("backward REQ completes on EOSE and does not expose its subId", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
    });
    const release = relay.hold();
    server.sockets.latest.open();
    const packets: object[] = [];
    const complete = vi.fn();

    relay.vreq("backward", [{}]).subscribe({
      next: (packet) => packets.push(packet),
      complete,
    });
    const [, subId] = await expectSent(server.sockets.latest, "REQ");
    server.sockets.latest.message(["EVENT", subId, Faker.event({ id: "event" })]);
    server.sockets.latest.message(["EOSE", subId]);

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
    await vi.waitFor(() => expect(server.sockets.latest.closeRequests).toHaveLength(1));
    server.sockets.latest.acknowledgeClose();
  });

  test("re-evaluates lazy filters when a REQ is resent after reconnect", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
      reconnector: { reconnect: () => ({ action: "retry", delay: 0 }) },
    });
    const release = relay.hold();
    server.sockets.latest.open();
    let since = 1;
    const subscription = relay.vreq("forward", [{ since: () => since }]).subscribe();
    const first = await expectSent(server.sockets.latest, "REQ");
    expect(first[2]).toMatchObject({
      since: 1,
    });

    server.sockets.latest.peerClose(1006, "offline");
    since = 2;
    await vi.waitFor(() => expect(server.connections).toHaveLength(2));
    server.sockets.latest.open();
    const resent = await expectSent(server.sockets.latest, "REQ");
    expect(resent[2]).toMatchObject({
      since: 2,
    });

    subscription.unsubscribe();
    await expectSent(server.sockets.latest, "CLOSE");
    release();
    await vi.waitFor(() => expect(server.sockets.latest.closeRequests).toHaveLength(1));
    server.sockets.latest.acknowledgeClose();
  });

  test("filters mismatched events and does not CLOSE a remotely terminated REQ", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
    });
    const release = relay.hold();
    server.sockets.latest.open();
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
    const [, subId] = await expectSent(server.sockets.latest, "REQ");

    server.sockets.latest.message(["EVENT", subId, Faker.event({ id: "wrong", kind: 2 })]);
    server.sockets.latest.message(["EVENT", subId, Faker.event({ id: "right", kind: 1 })]);
    server.sockets.latest.message(["EOSE", subId]);
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(events).toEqual(["right"]);
    expect(server.sockets.latest.sent).toHaveLength(1);

    release();
    await vi.waitFor(() => expect(server.sockets.latest.closeRequests).toHaveLength(1));
    server.sockets.latest.acknowledgeClose();
  });

  test("treats a backward timeout as relay-local completion and sends CLOSE", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
    });
    const release = relay.hold();
    server.sockets.latest.open();
    const complete = vi.fn();
    const error = vi.fn();
    relay.vreq("backward", [{}], { timeout: 5 }).subscribe({
      complete,
      error,
    });

    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(error).not.toHaveBeenCalled();
    const req = server.sockets.latest.latestSent("REQ");
    const close = await expectSent(server.sockets.latest, "CLOSE");
    expect(close).toEqual(["CLOSE", req[1]]);

    release();
    await vi.waitFor(() => expect(server.sockets.latest.closeRequests).toHaveLength(1));
    server.sockets.latest.acknowledgeClose();
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
    server.sockets.latest.open();
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
    const first = await expectSent(server.sockets.latest, "REQ");
    server.sockets.latest.message(["EOSE", first[1]]);

    const second = await expectSent(server.sockets.latest, "REQ", 2);
    expect(firstComplete).toHaveBeenCalledOnce();
    expect(second[2]).toMatchObject({ kinds: [2] });
    server.sockets.latest.message(["EOSE", second[1]]);
    await vi.waitFor(() => expect(secondComplete).toHaveBeenCalledOnce());
    expect(server.sockets.latest.sent).toHaveLength(2);

    release();
    await vi.waitFor(() => expect(server.sockets.latest.closeRequests).toHaveLength(1));
    server.sockets.latest.acknowledgeClose();
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
    server.sockets.latest.open();
    const queuedComplete = vi.fn();
    const thirdComplete = vi.fn();
    relay.vreq("backward", [{ kinds: [1] }]).subscribe();
    relay.vreq("backward", [{ kinds: [2] }], { timeout: 10 }).subscribe({
      complete: queuedComplete,
    });
    relay.vreq("backward", [{ kinds: [3] }]).subscribe({ complete: thirdComplete });

    const first = await expectSent(server.sockets.latest, "REQ");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(queuedComplete).not.toHaveBeenCalled();
    expect(server.sockets.latest.sentOfType("REQ")).toHaveLength(1);

    server.sockets.latest.message(["EOSE", first[1]]);
    await vi.waitFor(() =>
      expect(server.sockets.latest.sentOfType("REQ").length).toBeGreaterThanOrEqual(2),
    );
    const second = server.sockets.latest.sentOfType("REQ")[1];
    expect(second[2]).toMatchObject({ kinds: [2] });
    await vi.waitFor(() => expect(queuedComplete).toHaveBeenCalledOnce());
    expect(await expectSent(server.sockets.latest, "CLOSE")).toEqual(["CLOSE", second[1]]);
    const third = await expectSent(server.sockets.latest, "REQ", 3);
    expect(third[2]).toMatchObject({ kinds: [3] });
    expect(server.sockets.latest.sent.slice(1, 4)).toEqual([second, ["CLOSE", second[1]], third]);
    server.sockets.latest.message(["EOSE", third[1]]);
    await vi.waitFor(() => expect(thirdComplete).toHaveBeenCalledOnce());

    release();
    await vi.waitFor(() => expect(server.sockets.latest.closeRequests).toHaveLength(1));
    server.sockets.latest.acknowledgeClose();
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
    server.sockets.latest.open();
    const firstComplete = vi.fn();
    const secondComplete = vi.fn();
    relay.vreq("backward", [{ kinds: [1] }]).subscribe({ complete: firstComplete });
    relay.vreq("backward", [{ kinds: [2] }]).subscribe({ complete: secondComplete });

    const initial = await expectSent(server.sockets.latest, "REQ");
    server.sockets.latest.peerClose(1006, "offline");
    await vi.waitFor(() => expect(server.connections).toHaveLength(2));
    server.sockets.latest.open();

    const resent = await expectSent(server.sockets.latest, "REQ");
    expect(resent[1]).toBe(initial[1]);
    expect(resent[2]).toMatchObject({ kinds: [1] });
    expect(server.sockets.latest.sentOfType("REQ")).toHaveLength(1);
    server.sockets.latest.message(["EOSE", resent[1]]);

    const second = await expectSent(server.sockets.latest, "REQ", 2);
    expect(second[2]).toMatchObject({ kinds: [2] });
    server.sockets.latest.message(["EOSE", second[1]]);
    await vi.waitFor(() => expect(secondComplete).toHaveBeenCalledOnce());
    expect(firstComplete).toHaveBeenCalledOnce();

    release();
    await vi.waitFor(() => expect(server.sockets.latest.closeRequests).toHaveLength(1));
    server.sockets.latest.acknowledgeClose();
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
    server.sockets.latest.open();
    const firstComplete = vi.fn();
    const queuedComplete = vi.fn();
    relay.vreq("backward", [{ kinds: [1] }]).subscribe({
      complete: firstComplete,
    });
    const queued = relay.vreq("backward", [{ kinds: [2] }]);
    queued.subscribe({ complete: queuedComplete });
    await expectSent(server.sockets.latest, "REQ");

    relay.dispose();

    expect(firstComplete).toHaveBeenCalledOnce();
    expect(queuedComplete).toHaveBeenCalledOnce();
    expect(server.sockets.latest.sentOfType("REQ")).toHaveLength(1);
    queued.subscribe({ complete: queuedComplete });
    expect(queuedComplete).toHaveBeenCalledTimes(2);
  });

  test("wraps a lazy filter exception without sending a REQ or CLOSE", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
    });
    const release = relay.hold();
    server.sockets.latest.open();
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
    expect(server.sockets.latest.sent).toEqual([]);

    release();
    await vi.waitFor(() => expect(server.sockets.latest.closeRequests).toHaveLength(1));
    server.sockets.latest.acknowledgeClose();
  });

  test("sends EVENT and maps the matching OK", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
    });
    const release = relay.hold();
    server.sockets.latest.open();
    const event = Faker.event({ id: "event" });
    const packets: object[] = [];

    relay.event(event).subscribe((packet) => packets.push(packet));
    expect(await expectSent(server.sockets.latest, "EVENT")).toEqual(["EVENT", event]);
    server.sockets.latest.message(["OK", "event", true, "saved"]);

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
    await vi.waitFor(() => expect(server.sockets.latest.closeRequests).toHaveLength(1));
    server.sockets.latest.acknowledgeClose();
  });

  test("authenticates and resends an EVENT once after auth-required", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
    });
    const release = relay.hold();
    server.sockets.latest.open();
    const event = Faker.event({ id: "event" });
    const authEvent = Faker.authEvent({
      id: "auth-event",
      relay: relay.url,
      challenge: "challenge",
    });
    const packets: object[] = [];
    const complete = vi.fn();
    relay
      .event(event, {
        authenticator: { authTimeout: 1_000, challenge: async () => authEvent },
      })
      .subscribe({ next: (packet) => packets.push(packet), complete });
    await expectSent(server.sockets.latest, "EVENT");
    server.sockets.latest.message(["AUTH", "challenge"]);
    server.sockets.latest.message(["OK", "event", false, "auth-required: login"]);

    expect(await expectSent(server.sockets.latest, "AUTH")).toEqual(["AUTH", authEvent]);
    server.sockets.latest.message(["OK", "auth-event", true, "authenticated"]);
    expect(await expectSent(server.sockets.latest, "EVENT", 2)).toEqual(["EVENT", event]);
    server.sockets.latest.message(["OK", "event", true, "saved"]);

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
    await vi.waitFor(() => expect(server.sockets.latest.closeRequests).toHaveLength(1));
    server.sockets.latest.acknowledgeClose();
  });

  test("coalesces rapid release and reacquire without a socket blink", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
    });
    const first = relay.hold();
    server.sockets.latest.open();
    await Promise.resolve();

    first();
    const second = relay.hold();
    await Promise.resolve();

    expect(server.connections).toHaveLength(1);
    expect(server.sockets.latest.closeRequests).toHaveLength(0);
    expect(relay.leaseCount).toBe(1);

    second();
    second();
    await vi.waitFor(() => expect(server.sockets.latest.closeRequests).toHaveLength(1));
    expect(relay.leaseCount).toBe(0);
    server.sockets.latest.acknowledgeClose();
  });

  test("dispose invalidates outstanding lease callbacks", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
    });
    const release = relay.hold();
    server.sockets.latest.open();
    await Promise.resolve();

    relay.dispose();
    expect(server.sockets.latest.closeRequests).toHaveLength(1);
    release();
    release();
    await Promise.resolve();

    expect(relay.leaseCount).toBe(0);
    expect(server.sockets.latest.closeRequests).toHaveLength(1);
    server.sockets.latest.acknowledgeClose();
  });
});
