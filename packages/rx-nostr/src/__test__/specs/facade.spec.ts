import type * as Nostr from "nostr-typedef";
import {
  NoopReconnector,
  NoopSigner,
  NoopVerifier,
  RelayDirectory,
  RxNostr,
  RxNostrAlreadyDisposedError,
  RxReq,
  type ConnectionStatePacket,
  type EventPacket,
  type RxNostrStaticDefaultConfig,
  type RxNostrStaticDefaultOptions,
} from "rx-nostr";
import { describe, expect, test, vi } from "vitest";

import {
  ControlledWebSocketServer,
  expectSent,
  expectSocketCloseRequested,
} from "../helper/index.ts";
import { SubscriptionInspector } from "../helper/subscription-inspector.ts";

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

async function withDefaultConfig(
  value: RxNostrStaticDefaultConfig,
  run: () => Promise<void>,
): Promise<void> {
  const previous = RxNostr.defaultConfig;
  try {
    RxNostr.defaultConfig = value;
    await run();
  } finally {
    RxNostr.defaultConfig = previous;
  }
}

async function withDefaultOptions(
  value: RxNostrStaticDefaultOptions,
  run: () => Promise<void>,
): Promise<void> {
  const previous = RxNostr.defaultOptions;
  try {
    RxNostr.defaultOptions = value;
    await run();
  } finally {
    RxNostr.defaultOptions = previous;
  }
}

async function expectLiveConnections(directory: RelayDirectory, count: number): Promise<void> {
  await vi.waitFor(() => expect(directory.get(relay)?.liveConnections).toBe(count));
}

describe("RxNostr facade lifecycle", () => {
  describe("static defaults", () => {
    test("applies static constructor defaults to subsequently constructed instances", async () => {
      const previous = RxNostr.defaultConfig;
      const server = new ControlledWebSocketServer();

      await withDefaultConfig(
        {
          ...previous,
          verifier: new NoopVerifier(),
          reconnector: new NoopReconnector(),
          skipFetchNip11: true,
          WebSocket: server.WebSocket,
        },
        async () => {
          const rxNostr = new RxNostr();
          const request = new RxReq();
          const inspector = new SubscriptionInspector<EventPacket>();
          const subscription = rxNostr.forward(relay, request).subscribe(inspector);

          request.emit([{}]);
          const socket = server.sockets.latest;
          socket.open();
          await expectSent(socket, "REQ");

          subscription.unsubscribe();
          rxNostr.dispose();
          await expectSocketCloseRequested(socket);
          socket.acknowledgeClose();
        },
      );
    });

    test("applies static operation defaults to subsequently constructed instances", async () => {
      const previous = RxNostr.defaultOptions;
      const server = new ControlledWebSocketServer();

      await withDefaultOptions(
        {
          req: { ...previous.req, linger: 0 },
          publish: { ...previous.publish },
        },
        async () => {
          const rxNostr = new RxNostr({
            verifier: new NoopVerifier(),
            reconnector: new NoopReconnector(),
            skipFetchNip11: true,
            WebSocket: server.WebSocket,
          });
          const inspector = new SubscriptionInspector<EventPacket>();

          rxNostr.backward(relay, [{}]).subscribe(inspector);

          const socket = server.sockets.latest;

          socket.open();
          const [, subId] = await expectSent(socket, "REQ");
          socket.message(["EOSE", subId]);

          await expect(inspector.waitComplete()).resolves.toBeUndefined();
          await expectSocketCloseRequested(socket);

          socket.acknowledgeClose();
          rxNostr.dispose();
        },
      );
    });
  });

  describe("disposal", () => {
    test("disposes active operations before transport and rejects later work", async () => {
      const server = new ControlledWebSocketServer();
      const rxNostr = new RxNostr({
        verifier: new NoopVerifier(),
        signer: new NoopSigner(),
        reconnector: new NoopReconnector(),
        defaultOptions: { publish: { linger: 0, timeout: 1_000 } },
        skipFetchNip11: true,
        WebSocket: server.WebSocket,
      });
      const firstInspector = new SubscriptionInspector<ConnectionStatePacket>();

      rxNostr.monitorConnectionState().subscribe(firstInspector);

      rxNostr.setHotRelays(relay);
      const connection = server.sockets.latest;
      connection.open();
      await firstInspector.ignoreNexts(2);
      await expect(firstInspector.waitNext()).resolves.toMatchObject({
        state: { state: "connected" },
      });

      const request = new RxReq();
      const secondInspector = new SubscriptionInspector<EventPacket>();

      rxNostr.forward(relay, request).subscribe(secondInspector);
      request.emit([{}]);
      const delayedReq = rxNostr.backward(relay, [{}]);
      const delayedMonitor = rxNostr.monitorConnectionState();

      const publication = rxNostr.publish(relay, signedEvent);
      const thirdInspector = new SubscriptionInspector<unknown>();

      publication.subscribe(thirdInspector);
      const cancelled = expect(publication.waitFor("all")).rejects.toMatchObject({
        code: "cancelled",
      });

      rxNostr.dispose();
      rxNostr.dispose();
      rxNostr[Symbol.dispose]();

      expect(secondInspector.completed).toBe(true);
      expect(thirdInspector.completed).toBe(true);
      await cancelled;
      expect(() => rxNostr.setHotRelays(relay)).toThrow(RxNostrAlreadyDisposedError);
      expect(() => rxNostr.unsetHotRelays()).toThrow(RxNostrAlreadyDisposedError);
      expect(() => rxNostr.publish(relay, signedEvent)).toThrow(RxNostrAlreadyDisposedError);

      const fourthInspector = new SubscriptionInspector<EventPacket>();

      delayedReq.subscribe(fourthInspector);
      await expect(fourthInspector.waitError()).resolves.toEqual(
        expect.any(RxNostrAlreadyDisposedError),
      );
      const fifthInspector = new SubscriptionInspector<EventPacket>();

      rxNostr.backward(relay, [{}]).subscribe(fifthInspector);
      await expect(fifthInspector.waitError()).resolves.toEqual(
        expect.any(RxNostrAlreadyDisposedError),
      );

      const sixthInspector = new SubscriptionInspector<ConnectionStatePacket>();

      delayedMonitor.subscribe(sixthInspector);
      await expect(sixthInspector.waitError()).resolves.toEqual(
        expect.any(RxNostrAlreadyDisposedError),
      );

      await expectSocketCloseRequested(connection);

      connection.acknowledgeClose();
      await expect(firstInspector.waitNext()).resolves.toMatchObject({
        state: { state: "dormant" },
      });
      await expect(firstInspector.waitNext()).resolves.toMatchObject({
        state: { state: "disposed" },
      });
      await expect(firstInspector.waitComplete()).resolves.toBeUndefined();
    });
  });

  describe("instance isolation", () => {
    test("keeps pools per instance while sharing directory metadata", async () => {
      const directory = new RelayDirectory();
      const firstServer = new ControlledWebSocketServer();
      const secondServer = new ControlledWebSocketServer();
      const first = new RxNostr({
        verifier: new NoopVerifier(),
        relayDirectory: directory,
        reconnector: new NoopReconnector(),
        skipFetchNip11: true,
        WebSocket: firstServer.WebSocket,
      });
      const second = new RxNostr({
        verifier: new NoopVerifier(),
        relayDirectory: directory,
        reconnector: new NoopReconnector(),
        skipFetchNip11: true,
        WebSocket: secondServer.WebSocket,
      });

      first.setHotRelays(relay);
      second.setHotRelays(relay);

      expect(firstServer.connections).toHaveLength(1);
      expect(secondServer.connections).toHaveLength(1);
      const socket2 = secondServer.sockets.latest;
      const socket = firstServer.sockets.latest;
      expect(socket).not.toBe(socket2);

      socket.open();
      socket2.open();
      await expectLiveConnections(directory, 2);

      first.dispose();
      await expectSocketCloseRequested(socket);
      socket.acknowledgeClose();
      await expectLiveConnections(directory, 1);
      expect(socket2.closeRequests).toHaveLength(0);

      second.dispose();
      await expectSocketCloseRequested(socket2);
      socket2.acknowledgeClose();
      await expectLiveConnections(directory, 0);
    });
  });

  describe("configuration precedence", () => {
    test("applies packet, operation, root-default precedence", async () => {
      const server = new ControlledWebSocketServer();
      const rootVerify = vi.fn(async (_event: Nostr.Event) => false);
      const operationVerify = vi.fn(async (_event: Nostr.Event) => true);
      const rxNostr = new RxNostr({
        verifier: { verifyEvent: rootVerify },
        defaultOptions: {
          req: {
            linger: 0,
            skipValidateFilterMatching: true,
            skipExpirationCheck: true,
          },
        },
        reconnector: new NoopReconnector(),
        skipFetchNip11: true,
        WebSocket: server.WebSocket,
      });
      const request = new RxReq();
      const inspector = new SubscriptionInspector<EventPacket>();

      rxNostr
        .backward(relay, request, {
          verifier: { verifyEvent: operationVerify },
          skipValidateFilterMatching: false,
          skipExpirationCheck: false,
        })
        .subscribe(inspector);

      request.emit([{ kinds: [1] }], {
        relays: "wss://packet.example.com",
        traceTag: "packet",
      });

      expect(server.connections).toHaveLength(1);
      const socket = server.sockets.latest;
      expect(socket.url).toBe("wss://packet.example.com");

      socket.open();
      const [, subId] = await expectSent(socket, "REQ");
      const now = Math.floor(Date.now() / 1_000);
      socket.message(["EVENT", subId, { ...signedEvent, id: "mismatch", kind: 2 }]);
      socket.message([
        "EVENT",
        subId,
        {
          ...signedEvent,
          id: "expired",
          tags: [["expiration", `${now - 1}`]],
        },
      ]);
      socket.message(["EVENT", subId, { ...signedEvent, id: "accepted" }]);
      socket.message(["EOSE", subId]);

      await expect(inspector.waitNext()).resolves.toMatchObject({
        traceTag: "packet",
        event: { id: "accepted" },
      });
      expect(rootVerify).not.toHaveBeenCalled();
      expect(operationVerify.mock.calls.map(([value]) => value.id)).toEqual([
        "expired",
        "accepted",
      ]);

      await expectSocketCloseRequested(socket);
      socket.acknowledgeClose();
      rxNostr.dispose();
    });
  });
});
