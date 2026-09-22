import type * as Nostr from "nostr-typedef";
import { describe, expect, test, vi } from "vitest";
import {
  RxNostr,
  NoopRetryer,
  NoopSigner,
  NoopVerifier,
  RelayDirectory,
  RxBackwardReq,
  RxForwardReq,
  RxNostrAlreadyDisposedError,
  type ConnectionStatePacket,
  type EventPacket,
} from "rx-nostr";
import { ControlledWebSocketServer } from "../support/controlled-websocket.ts";

const relay = "wss://relay.example.com";

const signedEvent: Nostr.Event = {
  id: "event",
  pubkey: "pubkey",
  created_at: 1,
  kind: 1,
  tags: [],
  content: "",
  sig: "signature",
};

describe("RxNostr facade lifecycle", () => {
  test("applies static operation defaults to subsequently constructed instances", async () => {
    const previous = RxNostr.defaultOptions;
    const server = new ControlledWebSocketServer();

    try {
      RxNostr.defaultOptions = {
        req: { ...previous.req, linger: 0 },
        publish: { ...previous.publish },
      };
      const rxNostr = new RxNostr({
        verifier: new NoopVerifier(),
        retry: new NoopRetryer(),
        skipFetchNip11: true,
        WebSocket: server.WebSocket,
      });
      const complete = vi.fn();
      rxNostr.req(relay, { strategy: "oneshot", filters: [{}] }).subscribe({ complete });

      server.sockets.latest.open();
      await vi.waitFor(() => expect(server.sockets.latest.sent).toHaveLength(1));
      const [, subId] = JSON.parse(server.sockets.latest.sent[0] as string) as ["REQ", string];
      server.sockets.latest.message(JSON.stringify(["EOSE", subId]));

      await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
      await vi.waitFor(() => expect(server.sockets.latest.closeRequests).toHaveLength(1));
      server.sockets.latest.acknowledgeClose();
      rxNostr.dispose();
    } finally {
      RxNostr.defaultOptions = previous;
    }
  });

  test("disposes active operations before transport and rejects later work", async () => {
    const server = new ControlledWebSocketServer();
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      retry: new NoopRetryer(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const states: ConnectionStatePacket[] = [];
    const stateComplete = vi.fn();
    rxNostr.monitorConnectionState().subscribe({
      next: (packet) => states.push(packet),
      complete: stateComplete,
    });
    rxNostr.setHotRelays(relay);
    const connection = server.sockets.latest;
    connection.open();
    await vi.waitFor(() =>
      expect(states.some((packet) => packet.state.state === "connected")).toBe(true),
    );

    const request = new RxForwardReq();
    const reqComplete = vi.fn();
    rxNostr.req(relay, request).subscribe({ complete: reqComplete });
    request.emit([{}]);
    const delayedReq = rxNostr.req(relay, { strategy: "oneshot", filters: [{}] });
    const delayedMonitor = rxNostr.monitorConnectionState();

    const publication = rxNostr.publish(relay, signedEvent, {
      signer: new NoopSigner(),
      linger: 0,
      timeout: 1_000,
    });
    const publicationComplete = vi.fn();
    publication.subscribe({ complete: publicationComplete });
    const cancelled = expect(publication.waitFor("all")).rejects.toMatchObject({
      code: "cancelled",
    });

    rxNostr.dispose();
    rxNostr.dispose();
    rxNostr[Symbol.dispose]();

    expect(reqComplete).toHaveBeenCalledOnce();
    expect(publicationComplete).toHaveBeenCalledOnce();
    await cancelled;
    expect(() => rxNostr.setHotRelays(relay)).toThrow(RxNostrAlreadyDisposedError);
    expect(() => rxNostr.unsetHotRelays()).toThrow(RxNostrAlreadyDisposedError);
    expect(() => rxNostr.publish(relay, signedEvent, { signer: new NoopSigner() })).toThrow(
      RxNostrAlreadyDisposedError,
    );

    const delayedReqError = vi.fn();
    delayedReq.subscribe({ error: delayedReqError });
    expect(delayedReqError).toHaveBeenCalledWith(expect.any(RxNostrAlreadyDisposedError));
    const newReqError = vi.fn();
    rxNostr.req(relay, { strategy: "oneshot", filters: [{}] }).subscribe({ error: newReqError });
    expect(newReqError).toHaveBeenCalledWith(expect.any(RxNostrAlreadyDisposedError));
    const monitorError = vi.fn();
    delayedMonitor.subscribe({ error: monitorError });
    expect(monitorError).toHaveBeenCalledWith(expect.any(RxNostrAlreadyDisposedError));

    await vi.waitFor(() => expect(connection.closeRequests).toHaveLength(1));
    connection.acknowledgeClose();
    await vi.waitFor(() => {
      expect(states.some((packet) => packet.state.state === "disposed")).toBe(true);
      expect(stateComplete).toHaveBeenCalledOnce();
    });
  });

  test("keeps pools per instance while sharing directory metadata", async () => {
    const directory = new RelayDirectory();
    const firstServer = new ControlledWebSocketServer();
    const secondServer = new ControlledWebSocketServer();
    const first = new RxNostr({
      verifier: new NoopVerifier(),
      relayDirectory: directory,
      retry: new NoopRetryer(),
      skipFetchNip11: true,
      WebSocket: firstServer.WebSocket,
    });
    const second = new RxNostr({
      verifier: new NoopVerifier(),
      relayDirectory: directory,
      retry: new NoopRetryer(),
      skipFetchNip11: true,
      WebSocket: secondServer.WebSocket,
    });

    first.setHotRelays(relay);
    second.setHotRelays(relay);
    expect(firstServer.connections).toHaveLength(1);
    expect(secondServer.connections).toHaveLength(1);
    expect(firstServer.sockets.latest).not.toBe(secondServer.sockets.latest);
    firstServer.sockets.latest.open();
    secondServer.sockets.latest.open();
    await vi.waitFor(() => expect(directory.get(relay)?.liveConnections).toBe(2));

    first.dispose();
    await vi.waitFor(() => expect(firstServer.sockets.latest.closeRequests).toHaveLength(1));
    firstServer.sockets.latest.acknowledgeClose();
    await vi.waitFor(() => expect(directory.get(relay)?.liveConnections).toBe(1));
    expect(secondServer.sockets.latest.closeRequests).toHaveLength(0);

    second.dispose();
    await vi.waitFor(() => expect(secondServer.sockets.latest.closeRequests).toHaveLength(1));
    secondServer.sockets.latest.acknowledgeClose();
    await vi.waitFor(() => expect(directory.get(relay)?.liveConnections).toBe(0));
  });

  test("applies packet, operation, root-default precedence", async () => {
    const server = new ControlledWebSocketServer();
    const rootVerify = vi.fn(async (_event: Nostr.Event) => false);
    const operationVerify = vi.fn(async (_event: Nostr.Event) => true);
    const rxNostr = new RxNostr({
      verifier: { verifyEvent: rootVerify },
      defaultOptions: {
        req: {
          skipValidateFilterMatching: true,
          skipExpirationCheck: true,
        },
      },
      retry: new NoopRetryer(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const request = new RxBackwardReq();
    const packets: EventPacket[] = [];
    rxNostr
      .req(relay, request, {
        verifier: { verifyEvent: operationVerify },
        skipValidateFilterMatching: false,
        skipExpirationCheck: false,
        linger: 0,
      })
      .subscribe((packet) => packets.push(packet));
    request.emit([{ kinds: [1] }], {
      relays: "wss://packet.example.com",
      traceTag: "packet",
    });
    request.over();
    expect(server.connections).toHaveLength(1);
    expect(server.sockets.latest.url).toBe("wss://packet.example.com");
    server.sockets.latest.open();
    await vi.waitFor(() => expect(server.sockets.latest.sent).toHaveLength(1));
    const [, subId] = JSON.parse(server.sockets.latest.sent[0] as string) as ["REQ", string];
    const now = Math.floor(Date.now() / 1_000);
    server.sockets.latest.message(
      JSON.stringify(["EVENT", subId, { ...signedEvent, id: "mismatch", kind: 2 }]),
    );
    server.sockets.latest.message(
      JSON.stringify([
        "EVENT",
        subId,
        {
          ...signedEvent,
          id: "expired",
          tags: [["expiration", `${now - 1}`]],
        },
      ]),
    );
    server.sockets.latest.message(
      JSON.stringify(["EVENT", subId, { ...signedEvent, id: "accepted" }]),
    );
    server.sockets.latest.message(JSON.stringify(["EOSE", subId]));

    await vi.waitFor(() => expect(packets).toHaveLength(1));
    expect(packets[0]).toMatchObject({
      traceTag: "packet",
      event: { id: "accepted" },
    });
    expect(rootVerify).not.toHaveBeenCalled();
    expect(operationVerify.mock.calls.map(([value]) => value.id)).toEqual(["expired", "accepted"]);
    await vi.waitFor(() => expect(server.sockets.latest.closeRequests).toHaveLength(1));
    server.sockets.latest.acknowledgeClose();
    rxNostr.dispose();
  });
});
