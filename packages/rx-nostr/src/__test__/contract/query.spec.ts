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
} from "rx-nostr";
import { ControlledWebSocketServer } from "../support/controlled-websocket.ts";

const relay = "wss://relay.example.com";

function event(overrides: Partial<Nostr.Event> = {}): Nostr.Event {
  return {
    id: "event",
    pubkey: "pubkey",
    created_at: Math.floor(Date.now() / 1000),
    kind: 1,
    tags: [],
    content: "",
    sig: "sig",
    ...overrides,
  };
}

describe("REQ public contract", () => {
  test("sends a backward REQ, exposes traceTag only, and ends on EOSE", async () => {
    const server = new ControlledWebSocketServer();
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      retry: new NoopRetryer(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
      defaultOptions: { req: { linger: 0 } },
    });
    const request = new RxBackwardReq();
    const packets: EventPacket[] = [];
    const complete = vi.fn();
    rxNostr
      .req(request, { relays: relay, timeout: 1_000 })
      .subscribe({ next: (packet) => packets.push(packet), complete });
    request.emit([{ kinds: [1] }], { traceTag: "timeline" });
    request.over();
    server.latestConnection.open();
    await vi.waitFor(() => expect(server.latestConnection.sent).toHaveLength(1));
    const req = JSON.parse(server.latestConnection.sent[0] as string) as ["REQ", string, object];
    expect(req[0]).toBe("REQ");
    expect(req[2]).toEqual({ kinds: [1] });

    const result = event({ id: "result" });
    server.latestConnection.message(JSON.stringify(["EVENT", req[1], result]));
    server.latestConnection.message(JSON.stringify(["EOSE", req[1]]));
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
    expect(server.latestConnection.sent).toHaveLength(1);

    await vi.waitFor(() => expect(server.latestConnection.closeRequests).toHaveLength(1));
    server.latestConnection.acknowledgeClose();
    rxNostr.dispose();
  });

  test("replaces a forward REQ and sends CLOSE for each local end", async () => {
    const server = new ControlledWebSocketServer();
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      retry: new NoopRetryer(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const request = new RxForwardReq();
    const subscription = rxNostr.req(request, { relays: relay, linger: 0 }).subscribe();
    request.emit([{ kinds: [1] }]);
    await vi.waitFor(() => expect(server.connections).toHaveLength(1));
    server.latestConnection.open();
    await vi.waitFor(() => expect(server.latestConnection.sent).toHaveLength(1));
    const first = JSON.parse(server.latestConnection.sent[0] as string) as ["REQ", string];

    request.emit([{ kinds: [2] }]);
    await vi.waitFor(() => expect(server.latestConnection.sent).toHaveLength(3));
    const messages = server.latestConnection.sent.map((value) => JSON.parse(value as string));
    const second = messages.find((message) => message[0] === "REQ" && message[1] !== first[1]);
    expect(messages).toContainEqual(["CLOSE", first[1]]);
    expect(second?.[2]).toEqual({ kinds: [2] });

    subscription.unsubscribe();
    await vi.waitFor(() => expect(server.latestConnection.sent).toHaveLength(4));
    expect(server.latestConnection.sent.map((value) => JSON.parse(value as string))).toContainEqual(
      ["CLOSE", second?.[1]],
    );
    await vi.waitFor(() => expect(server.latestConnection.closeRequests).toHaveLength(1));
    server.latestConnection.acknowledgeClose();
    rxNostr.dispose();
  });

  test("completes an empty destination without creating a connection", async () => {
    const server = new ControlledWebSocketServer();
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const complete = vi.fn();
    const error = vi.fn();
    rxNostr.req([{}], { relays: [] }).subscribe({ complete, error });

    await vi.waitFor(() => expect(complete.mock.calls.length + error.mock.calls.length).toBe(1));
    expect(complete).toHaveBeenCalledOnce();
    expect(error).not.toHaveBeenCalled();
    expect(server.connections).toEqual([]);
    rxNostr.dispose();
  });

  test("applies filter matching, verification, and expiration in order", async () => {
    const server = new ControlledWebSocketServer();
    const verified: string[] = [];
    const rxNostr = new RxNostr({
      verifier: {
        async verifyEvent(value) {
          verified.push(value.id);
          return value.id !== "invalid-signature";
        },
      },
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const packets: EventPacket[] = [];
    const complete = vi.fn();
    rxNostr
      .req([{ kinds: [1] }], { relays: relay, linger: 0 })
      .subscribe({ next: (packet) => packets.push(packet), complete });
    server.latestConnection.open();
    await vi.waitFor(() => expect(server.latestConnection.sent).toHaveLength(1));
    const [, subId] = JSON.parse(server.latestConnection.sent[0] as string) as ["REQ", string];
    const expiredAt = Math.floor(Date.now() / 1000) - 1;
    for (const value of [
      event({ id: "mismatch", kind: 2 }),
      event({ id: "invalid-signature" }),
      event({ id: "expired", tags: [["expiration", `${expiredAt}`]] }),
      event({ id: "valid" }),
    ]) {
      server.latestConnection.message(JSON.stringify(["EVENT", subId, value]));
    }
    server.latestConnection.message(JSON.stringify(["EOSE", subId]));

    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(verified).toEqual(["invalid-signature", "expired", "valid"]);
    expect(packets.map((packet) => packet.event.id)).toEqual(["valid"]);
    await vi.waitFor(() => expect(server.latestConnection.closeRequests).toHaveLength(1));
    server.latestConnection.acknowledgeClose();
    rxNostr.dispose();
  });

  test("wraps verifier exceptions as callback errors", async () => {
    const server = new ControlledWebSocketServer();
    const cause = new Error("verifier failed");
    const rxNostr = new RxNostr({
      verifier: { verifyEvent: async () => Promise.reject(cause) },
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    let received: unknown;
    rxNostr.req([{}], { relays: relay, linger: 0 }).subscribe({
      error: (error) => (received = error),
    });
    server.latestConnection.open();
    await vi.waitFor(() => expect(server.latestConnection.sent).toHaveLength(1));
    const [, subId] = JSON.parse(server.latestConnection.sent[0] as string) as ["REQ", string];
    server.latestConnection.message(JSON.stringify(["EVENT", subId, event()]));

    await vi.waitFor(() => expect(received).toBeDefined());
    expect(received).toMatchObject({
      name: "RxNostrCallbackError",
      callback: "verifier",
      cause,
    });
    await vi.waitFor(() => expect(server.latestConnection.sent).toHaveLength(2));
    expect(JSON.parse(server.latestConnection.sent[1] as string)).toEqual(["CLOSE", subId]);
    await vi.waitFor(() => expect(server.latestConnection.closeRequests).toHaveLength(1));
    server.latestConnection.acknowledgeClose();
    rxNostr.dispose();
  });

  test("honors filter/expiration skips and wraps lazy filter exceptions", async () => {
    const server = new ControlledWebSocketServer();
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const packets: EventPacket[] = [];
    rxNostr
      .req([{ kinds: [1] }], {
        relays: relay,
        linger: 0,
        skipExpirationCheck: true,
        skipValidateFilterMatching: true,
      })
      .subscribe((packet) => packets.push(packet));
    server.latestConnection.open();
    await vi.waitFor(() => expect(server.latestConnection.sent).toHaveLength(1));
    const [, subId] = JSON.parse(server.latestConnection.sent[0] as string) as ["REQ", string];
    server.latestConnection.message(
      JSON.stringify([
        "EVENT",
        subId,
        event({
          id: "skipped",
          kind: 2,
          tags: [["expiration", "0"]],
        }),
      ]),
    );
    server.latestConnection.message(JSON.stringify(["EOSE", subId]));
    await vi.waitFor(() => expect(packets.map((packet) => packet.event.id)).toEqual(["skipped"]));
    await vi.waitFor(() => expect(server.latestConnection.closeRequests).toHaveLength(1));
    server.latestConnection.acknowledgeClose();
    rxNostr.dispose();

    const callbackServer = new ControlledWebSocketServer();
    const callbackRxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      skipFetchNip11: true,
      WebSocket: callbackServer.WebSocket,
    });
    const cause = new Error("filter failed");
    let received: unknown;
    callbackRxNostr
      .req(
        [
          {
            since: () => {
              throw cause;
            },
          },
        ],
        { relays: relay, linger: 0 },
      )
      .subscribe({ error: (error) => (received = error) });
    callbackServer.latestConnection.open();
    await vi.waitFor(() => expect(received).toBeDefined());
    expect(received).toMatchObject({
      name: "RxNostrCallbackError",
      callback: "filter",
      cause,
    });
    expect(callbackServer.latestConnection.sent).toEqual([]);
    await vi.waitFor(() => expect(callbackServer.latestConnection.closeRequests).toHaveLength(1));
    callbackServer.latestConnection.acknowledgeClose();
    callbackRxNostr.dispose();
  });

  test("isolates one relay's retry exhaustion from another relay", async () => {
    const server = new ControlledWebSocketServer();
    const one = "wss://one.example.com";
    const two = "wss://two.example.com";
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      retry: new NoopRetryer(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const packets: EventPacket[] = [];
    const complete = vi.fn();
    rxNostr.req([{}], { relays: [one, two], linger: 0 }).subscribe({
      next: (packet) => packets.push(packet),
      complete,
    });
    await vi.waitFor(() => expect(server.connections).toHaveLength(2));
    const first = server.latestConnectionFor(one);
    const second = server.latestConnectionFor(two);
    first.open();
    second.open();
    await vi.waitFor(() =>
      expect(server.connections.every((socket) => socket.sent.length === 1)).toBe(true),
    );
    first.peerClose(1006, "offline");
    const [, secondSubId] = JSON.parse(second.sent[0] as string) as ["REQ", string];
    second.message(JSON.stringify(["EVENT", secondSubId, event({ id: "from-two" })]));
    second.message(JSON.stringify(["EOSE", secondSubId]));

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
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      relayDirectory: directory,
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const request = new RxBackwardReq();
    const complete = vi.fn();
    rxNostr.req(request, { relays: relay, linger: 0 }).subscribe({ complete });
    request.emit([{ kinds: [1] }]);
    request.emit([{ kinds: [2] }]);
    request.over();
    server.latestConnection.open();
    await vi.waitFor(() => expect(server.latestConnection.sent).toHaveLength(1));
    const first = JSON.parse(server.latestConnection.sent[0] as string) as [
      "REQ",
      string,
      { kinds: number[] },
    ];
    expect(first[2]).toEqual({ kinds: [1] });
    server.latestConnection.message(JSON.stringify(["EOSE", first[1]]));

    await vi.waitFor(() => expect(server.latestConnection.sent).toHaveLength(2));
    const second = JSON.parse(server.latestConnection.sent[1] as string) as [
      "REQ",
      string,
      { kinds: number[] },
    ];
    expect(second[2]).toEqual({ kinds: [2] });
    server.latestConnection.message(JSON.stringify(["EOSE", second[1]]));
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(server.latestConnection.closeRequests).toHaveLength(1));
    server.latestConnection.acknowledgeClose();
    rxNostr.dispose();
  });

  test("sends an unfinished backward query to a dynamically added relay", async () => {
    const server = new ControlledWebSocketServer();
    const one = "wss://one.example.com";
    const two = "wss://two.example.com";
    const destinations = new RxRelays([one]);
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const request = new RxBackwardReq();
    const packets: EventPacket[] = [];
    const complete = vi.fn();
    rxNostr.req(request, { relays: destinations, linger: 0 }).subscribe({
      next: (packet) => packets.push(packet),
      complete,
    });
    request.emit([{ kinds: [1] }]);
    request.over();
    await vi.waitFor(() => expect(server.connections).toHaveLength(1));
    const first = server.latestConnectionFor(one);
    first.open();
    await vi.waitFor(() => expect(first.sent).toHaveLength(1));

    destinations.append(two);
    await vi.waitFor(() => expect(server.connections).toHaveLength(2));
    const second = server.latestConnectionFor(two);
    second.open();
    await vi.waitFor(() => expect(second.sent).toHaveLength(1));
    const [, firstSubId] = JSON.parse(first.sent[0] as string) as ["REQ", string];
    const [, secondSubId] = JSON.parse(second.sent[0] as string) as ["REQ", string];
    second.message(JSON.stringify(["EVENT", secondSubId, event({ id: "dynamic" })]));
    first.message(JSON.stringify(["EOSE", firstSubId]));
    second.message(JSON.stringify(["EOSE", secondSubId]));

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
