import { NoopReconnector, NoopSigner, NoopVerifier, RxReq } from "rx-nostr";
import { filter, firstValueFrom } from "rxjs";
import { describe, expect, test } from "vitest";

import { createLegacyRxNostr } from "../../legacy.ts";
import type { EventPacket } from "../../packets/packets.interface.ts";
import { Faker } from "../helper/faker.ts";
import { publicationEvent } from "../helper/publication-scenario.ts";
import { SubscriptionInspector } from "../helper/subscription-inspector.ts";
import { ControlledWebSocketServer } from "../support/controlled-websocket.ts";

describe("createLegacyRxNostr", () => {
  test("cast waits for one EVENT frame but not for OK", async () => {
    const server = new ControlledWebSocketServer();
    const relays = ["wss://first.example.com", "wss://second.example.com"];
    const client = createLegacyRxNostr({
      signer: new NoopSigner(),
      reconnector: new NoopReconnector(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });

    client.setDefaultRelays(relays);

    let settled = false;
    const cast = client.cast(publicationEvent()).then(() => {
      settled = true;
    });

    try {
      await Promise.resolve();
      await Promise.resolve();
      expect(settled).toBe(false);
      expect([...server.connections].every((socket) => socket.inbox.length === 0)).toBe(true);

      const first = server.sockets.latestFor(relays[0]!);

      first.open();
      await expect(first.inbox.waitNext("EVENT")).resolves.toHaveProperty("1.id", "event");
      await cast;
      expect(settled).toBe(true);
    } finally {
      client.dispose();

      for (const socket of server.connections) {
        socket.acknowledgeClose();
      }
    }
  });

  test("cast rejects when no writable relay is selected", async () => {
    const client = createLegacyRxNostr({ signer: new NoopSigner() });

    try {
      await expect(client.cast(publicationEvent())).rejects.toMatchObject({ code: "no-relays" });
    } finally {
      client.dispose();
    }
  });

  test("cast rejects when every destination fails before sending", async () => {
    const server = new ControlledWebSocketServer();
    const relays = ["wss://first.example.com", "wss://second.example.com"];
    const client = createLegacyRxNostr({
      signer: new NoopSigner(),
      reconnector: new NoopReconnector(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });

    client.setDefaultRelays(relays);
    const result = client.cast(publicationEvent()).then(
      () => "sent",
      (error: unknown) => error,
    );

    try {
      const first = server.sockets.latestFor(relays[0]!);
      const second = server.sockets.latestFor(relays[1]!);

      first.error(new Error("connection failed"));
      second.error(new Error("connection failed"));

      await expect(result).resolves.toMatchObject({
        code: "all-failed",
        failures: [{ relay: relays[0] }, { relay: relays[1] }],
      });
    } finally {
      client.dispose();

      for (const socket of server.connections) {
        socket.acknowledgeClose();
      }
    }
  });

  test("cast succeeds when one destination sends after another fails", async () => {
    const server = new ControlledWebSocketServer();
    const relays = ["wss://first.example.com", "wss://second.example.com"];
    const client = createLegacyRxNostr({
      signer: new NoopSigner(),
      reconnector: new NoopReconnector(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });

    client.setDefaultRelays(relays);
    const cast = client.cast(publicationEvent());

    try {
      server.sockets.latestFor(relays[0]!).error(new Error("connection failed"));
      const second = server.sockets.latestFor(relays[1]!);

      second.open();
      await second.inbox.waitNext("EVENT");
      await expect(cast).resolves.toBeUndefined();
    } finally {
      client.dispose();

      for (const socket of server.connections) {
        socket.acknowledgeClose();
      }
    }
  });

  test("cast waits for a pending AUTH challenge before sending EVENT", async () => {
    const server = new ControlledWebSocketServer();
    const relay = "wss://auth.example.com";
    const client = createLegacyRxNostr({
      signer: new NoopSigner(),
      connectionStrategy: "aggressive",
      authenticator: {
        challenge: async (_relay, challenge) =>
          Faker.authEvent({ id: "auth-event", relay, challenge }),
      },
      reconnector: new NoopReconnector(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });

    client.setDefaultRelays(relay);

    try {
      const socket = server.sockets.latestFor(relay);
      const connected = firstValueFrom(
        client.createConnectionStateObservable().pipe(filter(({ state }) => state === "connected")),
      );

      socket.open();
      await connected;
      socket.message(["AUTH", "challenge"]);
      await expect(socket.inbox.waitNext()).resolves.toHaveProperty("0", "AUTH");

      const result = client.cast(publicationEvent());

      expect(socket.inbox.length).toBe(1);

      socket.message(["OK", "auth-event", true, ""]);
      await expect(socket.inbox.waitNext("EVENT")).resolves.toHaveProperty("1.id", "event");
      await result;
    } finally {
      client.dispose();

      for (const socket of server.connections) {
        socket.acknowledgeClose();
      }
    }
  });
  test("routes v3 use() through readable default relays", async () => {
    const server = new ControlledWebSocketServer();
    const client = createLegacyRxNostr({
      verifier: new NoopVerifier(),
      reconnector: new NoopReconnector(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const readableRelay = "wss://read.example.com";
    const writeOnlyRelay = "wss://write.example.com";

    client.setDefaultRelays([
      { url: readableRelay, read: true, write: false },
      { url: writeOnlyRelay, read: false, write: true },
    ]);

    expect([...client.defaultRelays]).toEqual([readableRelay, writeOnlyRelay]);

    const request = new RxReq();
    const inspector = new SubscriptionInspector<EventPacket>();
    const subscription = client.use(request).subscribe(inspector);

    request.emit([{}]);

    const socket = server.sockets.latestFor(readableRelay);

    socket.open();
    await expect(socket.inbox.waitNext()).resolves.toHaveProperty("0", "REQ");
    expect([...server.connections].map(({ url }) => url)).toContain(readableRelay);
    expect([...server.connections].map(({ url }) => url)).not.toContain(writeOnlyRelay);

    subscription.unsubscribe();
    client.dispose();
    request.dispose();

    for (const connection of server.connections) {
      connection.acknowledgeClose();
    }
  });
});
