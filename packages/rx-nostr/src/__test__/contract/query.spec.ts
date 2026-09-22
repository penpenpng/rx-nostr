import type * as Nostr from "nostr-typedef";
import { describe, expect, test, vi } from "vitest";
import {
  RxNostr,
  NoopRetryer,
  NoopVerifier,
  RelayDirectory,
  RxBackwardReq,
  RxForwardReq,
  RxRelays,
  type EventPacket,
  type RxNostrConfig,
} from "rx-nostr";
import { ControlledWebSocketServer, expectSent, Faker } from "../helper/index.ts";

const relay = "wss://relay.example.com";

function event(overrides: Partial<Nostr.Event> = {}): Nostr.Event {
  return Faker.event({
    id: "event",
    pubkey: "pubkey",
    created_at: Math.floor(Date.now() / 1000),
    kind: 1,
    tags: [],
    content: "",
    sig: "sig",
    ...overrides,
  });
}

function createRxNostr(
  server: ControlledWebSocketServer,
  overrides: Partial<RxNostrConfig> = {},
): RxNostr {
  return new RxNostr({
    verifier: new NoopVerifier(),
    retry: new NoopRetryer(),
    defaultOptions: { req: { linger: 0, timeout: 1_000 } },
    skipFetchNip11: true,
    WebSocket: server.WebSocket,
    ...overrides,
  });
}

describe("REQ public contract", () => {
  test("sends a backward REQ, exposes traceTag only, and ends on EOSE", async () => {
    const server = new ControlledWebSocketServer();
    const rxNostr = createRxNostr(server);
    const request = new RxBackwardReq();
    const packets: EventPacket[] = [];
    const complete = vi.fn();
    rxNostr.req(relay, request).subscribe({ next: (packet) => packets.push(packet), complete });
    request.emit([{ kinds: [1] }], { traceTag: "timeline" });
    request.over();
    server.sockets.latest.open();
    const req = await expectSent(server.sockets.latest, "REQ");
    expect(req[0]).toBe("REQ");
    expect(req[2]).toEqual({ kinds: [1] });

    const result = event({ id: "result" });
    server.sockets.latest.message(["EVENT", req[1], result]);
    server.sockets.latest.message(["EOSE", req[1]]);
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(packets).toEqual([
      {
        from: relay,
        type: "EVENT",
        event: result,
        traceTag: "timeline",
      },
    ]);
    expect(packets[0]).not.toHaveProperty("subId");
    expect(packets[0]).not.toHaveProperty("vreqId");
    expect(packets[0]).not.toHaveProperty("message");
    expect(server.sockets.latest.sent).toHaveLength(1);

    await vi.waitFor(() => expect(server.sockets.latest.closeRequests).toHaveLength(1));
    server.sockets.latest.acknowledgeClose();
    rxNostr.dispose();
  });

  test("replaces a forward REQ and sends CLOSE for each local end", async () => {
    const server = new ControlledWebSocketServer();
    const rxNostr = createRxNostr(server);
    const request = new RxForwardReq();
    const subscription = rxNostr.req(relay, request).subscribe();
    request.emit([{ kinds: [1] }]);
    await vi.waitFor(() => expect(server.connections).toHaveLength(1));
    server.sockets.latest.open();
    const first = await expectSent(server.sockets.latest, "REQ");

    request.emit([{ kinds: [2] }]);
    const second = await expectSent(server.sockets.latest, "REQ", 2);
    await expectSent(server.sockets.latest, "CLOSE");
    expect(server.sockets.latest.sent).toContainEqual(["CLOSE", first[1]]);
    expect(second[2]).toEqual({ kinds: [2] });

    subscription.unsubscribe();
    await expectSent(server.sockets.latest, "CLOSE", 2);
    expect(server.sockets.latest.sent).toContainEqual(["CLOSE", second[1]]);
    await vi.waitFor(() => expect(server.sockets.latest.closeRequests).toHaveLength(1));
    server.sockets.latest.acknowledgeClose();
    rxNostr.dispose();
  });

  test("keeps a fixed forward descriptor active after EOSE", async () => {
    const server = new ControlledWebSocketServer();
    const rxNostr = createRxNostr(server);
    const packets: EventPacket[] = [];
    const complete = vi.fn();
    const subscription = rxNostr
      .req(relay, { strategy: "forward", filters: { kinds: [1] } })
      .subscribe({ next: (packet) => packets.push(packet), complete });

    server.sockets.latest.open();
    const [, subId] = await expectSent(server.sockets.latest, "REQ");
    server.sockets.latest.message(["EOSE", subId]);
    server.sockets.latest.message(["EVENT", subId, event({ id: "live" })]);

    await vi.waitFor(() => expect(packets.map((packet) => packet.event.id)).toEqual(["live"]));
    expect(complete).not.toHaveBeenCalled();

    subscription.unsubscribe();
    await vi.waitFor(() => expect(server.sockets.latest.closeRequests).toHaveLength(1));
    server.sockets.latest.acknowledgeClose();
    rxNostr.dispose();
  });

  test("completes an empty destination without creating a connection", async () => {
    const server = new ControlledWebSocketServer();
    const rxNostr = createRxNostr(server);
    const complete = vi.fn();
    const error = vi.fn();
    rxNostr.req([], { strategy: "oneshot", filters: [{}] }).subscribe({ complete, error });

    await vi.waitFor(() => expect(complete.mock.calls.length + error.mock.calls.length).toBe(1));
    expect(complete).toHaveBeenCalledOnce();
    expect(error).not.toHaveBeenCalled();
    expect(server.connections).toEqual([]);
    rxNostr.dispose();
  });

  test("applies filter matching, verification, and expiration in order", async () => {
    const server = new ControlledWebSocketServer();
    const verified: string[] = [];
    const rxNostr = createRxNostr(server, {
      verifier: {
        async verifyEvent(value) {
          verified.push(value.id);
          return value.id !== "invalid-signature";
        },
      },
    });
    const packets: EventPacket[] = [];
    const complete = vi.fn();
    rxNostr
      .req(relay, { strategy: "oneshot", filters: { kinds: [1] } })
      .subscribe({ next: (packet) => packets.push(packet), complete });
    server.sockets.latest.open();
    const [, subId] = await expectSent(server.sockets.latest, "REQ");
    const expiredAt = Math.floor(Date.now() / 1000) - 1;
    for (const value of [
      event({ id: "mismatch", kind: 2 }),
      event({ id: "invalid-signature" }),
      event({ id: "expired", tags: [["expiration", `${expiredAt}`]] }),
      event({ id: "valid" }),
    ]) {
      server.sockets.latest.message(["EVENT", subId, value]);
    }
    server.sockets.latest.message(["EOSE", subId]);

    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(verified).toEqual(["invalid-signature", "expired", "valid"]);
    expect(packets.map((packet) => packet.event.id)).toEqual(["valid"]);
    await vi.waitFor(() => expect(server.sockets.latest.closeRequests).toHaveLength(1));
    server.sockets.latest.acknowledgeClose();
    rxNostr.dispose();
  });

  test("wraps verifier exceptions as callback errors", async () => {
    const server = new ControlledWebSocketServer();
    const cause = new Error("verifier failed");
    const rxNostr = createRxNostr(server, {
      verifier: { verifyEvent: async () => Promise.reject(cause) },
    });
    let received: unknown;
    rxNostr.req(relay, { strategy: "oneshot", filters: [{}] }).subscribe({
      error: (error) => (received = error),
    });
    server.sockets.latest.open();
    const [, subId] = await expectSent(server.sockets.latest, "REQ");
    server.sockets.latest.message(["EVENT", subId, event()]);

    await vi.waitFor(() => expect(received).toBeDefined());
    expect(received).toMatchObject({
      name: "RxNostrCallbackError",
      callback: "verifier",
      cause,
    });
    expect(await expectSent(server.sockets.latest, "CLOSE")).toEqual(["CLOSE", subId]);
    await vi.waitFor(() => expect(server.sockets.latest.closeRequests).toHaveLength(1));
    server.sockets.latest.acknowledgeClose();
    rxNostr.dispose();
  });

  test("honors filter/expiration skips and wraps lazy filter exceptions", async () => {
    const server = new ControlledWebSocketServer();
    const rxNostr = createRxNostr(server);
    const packets: EventPacket[] = [];
    rxNostr
      .req(
        relay,
        { strategy: "oneshot", filters: [{ kinds: [1] }] },
        {
          skipExpirationCheck: true,
          skipValidateFilterMatching: true,
        },
      )
      .subscribe((packet) => packets.push(packet));
    server.sockets.latest.open();
    const [, subId] = await expectSent(server.sockets.latest, "REQ");
    server.sockets.latest.message([
      "EVENT",
      subId,
      event({
        id: "skipped",
        kind: 2,
        tags: [["expiration", "0"]],
      }),
    ]);
    server.sockets.latest.message(["EOSE", subId]);
    await vi.waitFor(() => expect(packets.map((packet) => packet.event.id)).toEqual(["skipped"]));
    await vi.waitFor(() => expect(server.sockets.latest.closeRequests).toHaveLength(1));
    server.sockets.latest.acknowledgeClose();
    rxNostr.dispose();

    const callbackServer = new ControlledWebSocketServer();
    const callbackRxNostr = createRxNostr(callbackServer);
    const cause = new Error("filter failed");
    let received: unknown;
    callbackRxNostr
      .req(relay, {
        strategy: "oneshot",
        filters: [
          {
            since: () => {
              throw cause;
            },
          },
        ],
      })
      .subscribe({ error: (error) => (received = error) });
    callbackServer.sockets.latest.open();
    await vi.waitFor(() => expect(received).toBeDefined());
    expect(received).toMatchObject({
      name: "RxNostrCallbackError",
      callback: "filter",
      cause,
    });
    expect(callbackServer.sockets.latest.sent).toEqual([]);
    await vi.waitFor(() => expect(callbackServer.sockets.latest.closeRequests).toHaveLength(1));
    callbackServer.sockets.latest.acknowledgeClose();
    callbackRxNostr.dispose();
  });

  test("isolates one relay's retry exhaustion from another relay", async () => {
    const server = new ControlledWebSocketServer();
    const one = "wss://one.example.com";
    const two = "wss://two.example.com";
    const rxNostr = createRxNostr(server);
    const packets: EventPacket[] = [];
    const complete = vi.fn();
    rxNostr.req([one, two], { strategy: "oneshot", filters: [{}] }).subscribe({
      next: (packet) => packets.push(packet),
      complete,
    });
    await vi.waitFor(() => expect(server.connections).toHaveLength(2));
    const first = server.sockets.latestFor(one);
    const second = server.sockets.latestFor(two);
    first.open();
    second.open();
    const [, secondSubId] = await expectSent(second, "REQ");
    await expectSent(first, "REQ");
    first.peerClose(1006, "offline");
    second.message(["EVENT", secondSubId, event({ id: "from-two" })]);
    second.message(["EOSE", secondSubId]);

    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(packets.map((packet) => packet.event.id)).toEqual(["from-two"]);
    await vi.waitFor(() => expect(second.closeRequests).toHaveLength(1));
    second.acknowledgeClose();
    rxNostr.dispose();
  });

  test("honors the RelayDirectory max_subscriptions queue", async () => {
    const server = new ControlledWebSocketServer();
    const directory = new RelayDirectory();
    directory.setNip11(relay, {
      limitation: { max_subscriptions: 1 },
    });
    const rxNostr = createRxNostr(server, {
      relayDirectory: directory,
    });
    const request = new RxBackwardReq();
    const complete = vi.fn();
    rxNostr.req(relay, request).subscribe({ complete });
    request.emit([{ kinds: [1] }]);
    request.emit([{ kinds: [2] }]);
    request.over();
    server.sockets.latest.open();
    const first = await expectSent(server.sockets.latest, "REQ");
    expect(first[2]).toEqual({ kinds: [1] });
    server.sockets.latest.message(["EOSE", first[1]]);

    const second = await expectSent(server.sockets.latest, "REQ", 2);
    expect(second[2]).toEqual({ kinds: [2] });
    server.sockets.latest.message(["EOSE", second[1]]);
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(server.sockets.latest.closeRequests).toHaveLength(1));
    server.sockets.latest.acknowledgeClose();
    rxNostr.dispose();
  });

  test("sends an unfinished backward query to a dynamically added relay", async () => {
    const server = new ControlledWebSocketServer();
    const one = "wss://one.example.com";
    const two = "wss://two.example.com";
    const destinations = new RxRelays([one]);
    const rxNostr = createRxNostr(server);
    const request = new RxBackwardReq();
    const packets: EventPacket[] = [];
    const complete = vi.fn();
    rxNostr.req(destinations, request).subscribe({
      next: (packet) => packets.push(packet),
      complete,
    });
    request.emit([{ kinds: [1] }]);
    request.over();
    await vi.waitFor(() => expect(server.connections).toHaveLength(1));
    const first = server.sockets.latestFor(one);
    first.open();
    const [, firstSubId] = await expectSent(first, "REQ");

    destinations.append(two);
    await vi.waitFor(() => expect(server.connections).toHaveLength(2));
    const second = server.sockets.latestFor(two);
    second.open();
    const [, secondSubId] = await expectSent(second, "REQ");
    second.message(["EVENT", secondSubId, event({ id: "dynamic" })]);
    first.message(["EOSE", firstSubId]);
    second.message(["EOSE", secondSubId]);

    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(packets.map((packet) => packet.event.id)).toEqual(["dynamic"]);
    await vi.waitFor(() =>
      expect(server.connections.every((socket) => socket.closeRequests.length === 1)).toBe(true),
    );
    for (const socket of server.connections) socket.acknowledgeClose();
    destinations.dispose();
    rxNostr.dispose();
  });
});
