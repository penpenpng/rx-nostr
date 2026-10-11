import { NoopReconnector, NoopSigner, NoopVerifier, RxReq, type Authenticator } from "rx-nostr";
import { filter, firstValueFrom, TimeoutError } from "rxjs";
import { describe, expect, test, vi } from "vitest";

import { createLegacyRxNostr } from "../../legacy.ts";
import type { EventPacket } from "../../packets/packets.interface.ts";
import { Faker } from "../helper/faker.ts";
import { publicationEvent } from "../helper/publication-scenario.ts";
import { SubscriptionInspector } from "../helper/subscription-inspector.ts";
import { ControlledWebSocketServer } from "../support/controlled-websocket.ts";

describe("createLegacyRxNostr", () => {
  test("accepts Set and generator relay inputs with read/write permissions", async () => {
    const server = new ControlledWebSocketServer();
    const readRelay = "wss://read.example.com";
    const writeRelay = "wss://write.example.com";
    const client = createLegacyRxNostr({
      signer: new NoopSigner(),
      verifier: new NoopVerifier(),
      reconnector: new NoopReconnector(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const request = new RxReq();

    function* writeRelays() {
      yield { url: writeRelay, read: false, write: true };
    }

    try {
      client.setDefaultRelays(new Set([{ url: readRelay, read: true, write: false }]));
      client.addDefaultRelays(writeRelays());

      expect(client.getDefaultRelays({ filter: "read-only" })).toHaveProperty(readRelay);
      expect(client.getDefaultRelays({ filter: "write-only" })).toHaveProperty(writeRelay);
      expect(client.getDefaultRelay(`${writeRelay}/`)).toMatchObject({ read: false, write: true });

      const subscription = client.use(request).subscribe();

      request.emit([{}]);
      const readSocket = server.sockets.latestFor(readRelay);

      readSocket.open();
      await expect(readSocket.inbox.waitNext("REQ")).resolves.toHaveProperty("0", "REQ");
      expect([...server.connections].map(({ url }) => url)).not.toContain(writeRelay);

      const sent = client.cast(publicationEvent());
      const writeSocket = server.sockets.latestFor(writeRelay);

      writeSocket.open();
      await expect(writeSocket.inbox.waitNext("EVENT")).resolves.toHaveProperty("1.id", "event");
      await sent;

      subscription.unsubscribe();
    } finally {
      request.dispose();
      client.dispose();

      for (const socket of server.connections) {
        socket.acknowledgeClose();
      }
    }
  });

  test("keeps each use subscription and dynamic relay view independent", async () => {
    const server = new ControlledWebSocketServer();
    const firstRelay = "wss://first.example.com";
    const secondRelay = "wss://second.example.com";
    const client = createLegacyRxNostr({
      verifier: new NoopVerifier(),
      reconnector: new NoopReconnector(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const request = new RxReq();

    try {
      client.setDefaultRelays(firstRelay);
      const events$ = client.use(request);

      expect(server.connections).toHaveLength(0);

      const first = events$.subscribe();
      const second = events$.subscribe();

      request.emit([{}]);
      const firstSocket = server.sockets.latestFor(firstRelay);

      firstSocket.open();
      await firstSocket.inbox.waitNext("REQ");
      await firstSocket.inbox.waitNext("REQ");

      first.unsubscribe();
      client.setDefaultRelays(secondRelay);

      const secondSocket = server.sockets.latestFor(secondRelay);

      secondSocket.open();
      await expect(secondSocket.inbox.waitNext("REQ")).resolves.toHaveProperty("0", "REQ");
      expect(second.closed).toBe(false);

      second.unsubscribe();
    } finally {
      request.dispose();
      client.dispose();

      for (const socket of server.connections) {
        socket.acknowledgeClose();
      }
    }
  });

  test("uses explicit and additional relays without the default readable set", async () => {
    const server = new ControlledWebSocketServer();
    const defaultRelay = "wss://default.example.com";
    const additionalRelay = "wss://additional.example.com";
    const explicitRelay = "wss://explicit.example.com";
    const client = createLegacyRxNostr({
      verifier: new NoopVerifier(),
      reconnector: new NoopReconnector(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const request = new RxReq();

    function* additional() {
      yield additionalRelay;
    }

    try {
      client.setDefaultRelays(defaultRelay);
      client.setAdditionalRelays(additional());
      const subscription = client
        .use(request, {
          on: { defaultReadRelays: false, relays: new Set([explicitRelay]) },
        })
        .subscribe();

      request.emit([{}]);
      const explicitSocket = server.sockets.latestFor(explicitRelay);

      explicitSocket.open();
      await expect(explicitSocket.inbox.waitNext("REQ")).resolves.toHaveProperty("0", "REQ");
      expect([...server.connections].map(({ url }) => url)).toEqual([explicitRelay]);
      subscription.unsubscribe();

      const additionalSubscription = client.use(request).subscribe();

      request.emit([{}]);
      const additionalSocket = server.sockets.latestFor(additionalRelay);

      additionalSocket.open();
      await expect(additionalSocket.inbox.waitNext("REQ")).resolves.toHaveProperty("0", "REQ");
      additionalSubscription.unsubscribe();
    } finally {
      request.dispose();
      client.dispose();

      for (const socket of server.connections) {
        socket.acknowledgeClose();
      }
    }
  });

  test("sends only to an explicit relay when default writes are disabled", async () => {
    const server = new ControlledWebSocketServer();
    const defaultRelay = "wss://default.example.com";
    const explicitRelay = "wss://explicit.example.com";
    const client = createLegacyRxNostr({
      signer: new NoopSigner(),
      reconnector: new NoopReconnector(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const inspector = new SubscriptionInspector<unknown>();

    try {
      client.setDefaultRelays(defaultRelay);
      client
        .send(publicationEvent(), {
          completeOn: "sent",
          on: { defaultWriteRelays: false, relays: new Set([explicitRelay]) },
        })
        .subscribe(inspector);
      const socket = server.sockets.latestFor(explicitRelay);

      socket.open();
      await expect(socket.inbox.waitNext("EVENT")).resolves.toHaveProperty("1.id", "event");
      await inspector.waitComplete();
      expect([...server.connections].map(({ url }) => url)).toEqual([explicitRelay]);
    } finally {
      client.dispose();

      for (const socket of server.connections) {
        socket.acknowledgeClose();
      }
    }
  });

  test("honors read/write flags on additional relays", async () => {
    const server = new ControlledWebSocketServer();
    const readRelay = "wss://additional-read.example.com";
    const writeRelay = "wss://additional-write.example.com";
    const client = createLegacyRxNostr({
      signer: new NoopSigner(),
      verifier: new NoopVerifier(),
      reconnector: new NoopReconnector(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const request = new RxReq();

    try {
      client.setAdditionalRelays(
        new Set([
          { url: readRelay, read: true, write: false },
          { url: writeRelay, read: false, write: true },
        ]),
      );
      const subscription = client.use(request).subscribe();

      request.emit([{}]);
      const readSocket = server.sockets.latestFor(readRelay);

      readSocket.open();
      await readSocket.inbox.waitNext("REQ");
      expect([...server.connections].map(({ url }) => url)).not.toContain(writeRelay);

      const sent = client.cast(publicationEvent());
      const writeSocket = server.sockets.latestFor(writeRelay);

      writeSocket.open();
      await writeSocket.inbox.waitNext("EVENT");
      await sent;
      subscription.unsubscribe();
    } finally {
      request.dispose();
      client.dispose();

      for (const socket of server.connections) {
        socket.acknowledgeClose();
      }
    }
  });

  test.each(["all-ok", "any-ok"] as const)(
    "send %s settles after the required OK responses",
    async (completeOn) => {
      const server = new ControlledWebSocketServer();
      const firstRelay = "wss://first.example.com";
      const secondRelay = "wss://second.example.com";
      const client = createLegacyRxNostr({
        signer: new NoopSigner(),
        reconnector: new NoopReconnector(),
        skipFetchNip11: true,
        WebSocket: server.WebSocket,
      });
      const inspector = new SubscriptionInspector<{ done: boolean; ok: boolean }>();

      try {
        client.setDefaultRelays([firstRelay, secondRelay]);
        client.send(publicationEvent(), { completeOn }).subscribe(inspector);
        const first = server.sockets.latestFor(firstRelay);
        const second = server.sockets.latestFor(secondRelay);

        first.open();
        second.open();
        await Promise.all([first.inbox.waitNext("EVENT"), second.inbox.waitNext("EVENT")]);
        const firstAccepted = completeOn === "all-ok";

        first.message(["OK", "event", firstAccepted, "first response"]);

        await expect(inspector.waitNext()).resolves.toMatchObject({
          done: true,
          ok: firstAccepted,
        });
        expect(inspector.completed).toBe(false);

        second.message(["OK", "event", true, "saved"]);
        await expect(inspector.waitNext()).resolves.toMatchObject({ done: true, ok: true });
        await inspector.waitComplete();

        expect(inspector.completed).toBe(true);
      } finally {
        client.dispose();

        for (const socket of server.connections) {
          socket.acknowledgeClose();
        }
      }
    },
  );

  test("reports failure when any-ok has no accepted relay", async () => {
    const server = new ControlledWebSocketServer();
    const relay = "wss://rejected.example.com";
    const client = createLegacyRxNostr({
      signer: new NoopSigner(),
      reconnector: new NoopReconnector(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const inspector = new SubscriptionInspector<unknown>();

    try {
      client.setDefaultRelays(relay);
      client.send(publicationEvent(), { completeOn: "any-ok" }).subscribe(inspector);
      const socket = server.sockets.latestFor(relay);

      socket.open();
      await socket.inbox.waitNext("EVENT");
      socket.message(["OK", "event", false, "rejected"]);

      await expect(inspector.waitNext()).resolves.toMatchObject({ ok: false });
      await expect(inspector.waitError()).resolves.toMatchObject({ code: "all-failed" });
    } finally {
      client.dispose();

      for (const socket of server.connections) {
        socket.acknowledgeClose();
      }
    }
  });

  test("keeps v3 all-ok completion after a final negative OK", async () => {
    const server = new ControlledWebSocketServer();
    const relay = "wss://rejected.example.com";
    const client = createLegacyRxNostr({
      signer: new NoopSigner(),
      reconnector: new NoopReconnector(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const inspector = new SubscriptionInspector<unknown>();

    try {
      client.setDefaultRelays(relay);
      client.send(publicationEvent(), { completeOn: "all-ok" }).subscribe(inspector);
      const socket = server.sockets.latestFor(relay);

      socket.open();
      await socket.inbox.waitNext("EVENT");
      socket.message(["OK", "event", false, "rejected"]);

      await expect(inspector.waitNext()).resolves.toMatchObject({ ok: false, done: true });
      await inspector.waitComplete();
      expect(inspector.errored).toBe(false);
    } finally {
      client.dispose();

      for (const socket of server.connections) {
        socket.acknowledgeClose();
      }
    }
  });

  test.each(["all-ok", "any-ok", "sent"] as const)(
    "rejects send %s when no writable relay is selected",
    async (completeOn) => {
      const server = new ControlledWebSocketServer();
      const client = createLegacyRxNostr({
        signer: new NoopSigner(),
        skipFetchNip11: true,
        WebSocket: server.WebSocket,
      });

      try {
        await expect(
          firstValueFrom(client.send(publicationEvent(), { completeOn })),
        ).rejects.toMatchObject({ code: "no-relays" });
        expect(server.connections).toHaveLength(0);
      } finally {
        client.dispose();
      }
    },
  );

  test("maps a timed-out send to TimeoutError when requested", async () => {
    vi.useFakeTimers();
    const server = new ControlledWebSocketServer();
    const relay = "wss://timeout.example.com";
    const client = createLegacyRxNostr({
      signer: new NoopSigner(),
      reconnector: new NoopReconnector(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const inspector = new SubscriptionInspector<unknown>();

    try {
      client.setDefaultRelays(relay);
      client.send(publicationEvent(), { timeout: 100, errorOnTimeout: true }).subscribe(inspector);
      const socket = server.sockets.latestFor(relay);

      socket.open();
      await socket.inbox.waitNext("EVENT");
      await vi.advanceTimersByTimeAsync(99);
      expect(inspector.errored).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await expect(inspector.waitError()).resolves.toBeInstanceOf(TimeoutError);
    } finally {
      client.dispose();

      for (const socket of server.connections) {
        socket.acknowledgeClose();
      }

      vi.useRealTimers();
    }
  });

  test("reports a signer failure through send", async () => {
    const cause = new Error("signing failed");
    const server = new ControlledWebSocketServer();
    const client = createLegacyRxNostr({
      signer: {
        async signEvent() {
          throw cause;
        },
        getPublicKey: async () => "unused",
      },
      reconnector: new NoopReconnector(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });

    try {
      client.setDefaultRelays("wss://relay.example.com");
      await expect(firstValueFrom(client.send(publicationEvent()))).rejects.toMatchObject({
        callback: "signer",
        cause,
      });
    } finally {
      client.dispose();

      for (const socket of server.connections) {
        socket.acknowledgeClose();
      }
    }
  });

  test.each(["lazy", "lazy-keep", "aggressive"] as const)(
    "uses the %s connection strategy for default relays",
    async (connectionStrategy) => {
      const server = new ControlledWebSocketServer();
      const relay = "wss://strategy.example.com";
      const client = createLegacyRxNostr({
        signer: new NoopSigner(),
        reconnector: new NoopReconnector(),
        connectionStrategy,
        disconnectTimeout: 0,
        skipFetchNip11: true,
        WebSocket: server.WebSocket,
      });

      try {
        client.setDefaultRelays(relay);
        expect(server.connections.length).toBe(connectionStrategy === "aggressive" ? 1 : 0);

        const sent = client.cast(publicationEvent());
        const socket = server.sockets.latestFor(relay);

        socket.open();
        await socket.inbox.waitNext("EVENT");
        await sent;
        await Promise.resolve();

        expect(socket.isCloseRequested).toBe(connectionStrategy === "lazy");
      } finally {
        client.dispose();

        for (const socket of server.connections) {
          socket.acknowledgeClose();
        }
      }
    },
  );

  test("retains newly selected relays after a lazy-keep query changes destinations", async () => {
    const server = new ControlledWebSocketServer();
    const firstRelay = "wss://first.example.com";
    const secondRelay = "wss://second.example.com";
    const client = createLegacyRxNostr({
      verifier: new NoopVerifier(),
      reconnector: new NoopReconnector(),
      connectionStrategy: "lazy-keep",
      disconnectTimeout: 0,
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const request = new RxReq();

    try {
      client.setDefaultRelays(firstRelay);
      const subscription = client.use(request).subscribe();

      request.emit([{}]);
      const first = server.sockets.latestFor(firstRelay);

      first.open();
      await first.inbox.waitNext("REQ");
      client.setDefaultRelays(secondRelay);

      const second = server.sockets.latestFor(secondRelay);

      second.open();
      await second.inbox.waitNext("REQ");
      subscription.unsubscribe();
      await Promise.resolve();
      expect(second.isCloseRequested).toBe(false);
    } finally {
      request.dispose();
      client.dispose();

      for (const socket of server.connections) {
        socket.acknowledgeClose();
      }
    }
  });

  test("applies the legacy immediate retry policy after a dropped connection", async () => {
    vi.useFakeTimers();
    const server = new ControlledWebSocketServer();
    const relay = "wss://retry.example.com";
    const client = createLegacyRxNostr({
      signer: new NoopSigner(),
      connectionStrategy: "aggressive",
      retry: { strategy: "immediately", maxCount: 1 },
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });

    try {
      client.setDefaultRelays(relay);
      const first = server.sockets.latestFor(relay);

      first.open();
      first.peerClose(1006, "offline");
      await vi.advanceTimersByTimeAsync(0);

      expect(server.connections).toHaveLength(2);
      expect(server.sockets.latestFor(relay)).not.toBe(first);
    } finally {
      client.dispose();

      for (const socket of server.connections) {
        socket.acknowledgeClose();
      }

      vi.useRealTimers();
    }
  });

  test("delegates AUTH through a relay-specific factory", async () => {
    const server = new ControlledWebSocketServer();
    const relay = "wss://factory.example.com";
    const challenge = vi.fn(async (relayUrl: string, value: string) =>
      Faker.authEvent({ id: "factory-auth", relay: relayUrl, challenge: value }),
    );
    const factory = vi.fn(() => ({ challenge }));
    const client = createLegacyRxNostr({
      signer: new NoopSigner(),
      connectionStrategy: "aggressive",
      authenticator: factory,
      authTimeout: 1_000,
      reconnector: new NoopReconnector(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });

    try {
      client.setDefaultRelays(`${relay}/`);
      const socket = server.sockets.latestFor(relay);
      const connected = firstValueFrom(
        client.createConnectionStateObservable().pipe(filter(({ state }) => state === "connected")),
      );

      socket.open();
      await connected;
      socket.message(["AUTH", "nonce"]);
      await expect(socket.inbox.waitNext("AUTH")).resolves.toHaveProperty("1.id", "factory-auth");
      expect(factory).toHaveBeenCalledWith(relay);
      expect(challenge).toHaveBeenCalledWith(relay, "nonce");
    } finally {
      client.dispose();

      for (const socket of server.connections) {
        socket.acknowledgeClose();
      }
    }
  });

  test("reports normalized connection state and completes it on disposal", async () => {
    const server = new ControlledWebSocketServer();
    const relay = "wss://state.example.com";
    const client = createLegacyRxNostr({
      connectionStrategy: "aggressive",
      reconnector: new NoopReconnector(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const states: string[] = [];
    let completed = false;

    client.createConnectionStateObservable().subscribe({
      next: (packet) => states.push(packet.state),
      complete: () => {
        completed = true;
      },
    });

    try {
      client.setDefaultRelays(`${relay}/`);
      const socket = server.sockets.latestFor(relay);
      const connected = firstValueFrom(
        client.createConnectionStateObservable().pipe(filter(({ state }) => state === "connected")),
      );

      socket.open();
      await connected;
      expect(client.getRelayStatus(`${relay}/`)).toEqual({ connection: "connected" });
      expect(client.getAllRelayStatus()).toHaveProperty(relay, { connection: "connected" });

      client.dispose();
      expect(client.getRelayStatus(relay)).toEqual({ connection: "terminated" });
      expect(states).toContain("connected");
      expect(states.at(-1)).toBe("terminated");
      expect(completed).toBe(true);
    } finally {
      client.dispose();

      for (const socket of server.connections) {
        socket.acknowledgeClose();
      }
    }
  });

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

    class LegacyAuthenticator implements Authenticator {
      readonly #id = "auth-event";

      async challenge(relayUrl: string, challenge: string) {
        return Faker.authEvent({ id: this.#id, relay: relayUrl, challenge });
      }
    }

    const client = createLegacyRxNostr({
      signer: new NoopSigner(),
      connectionStrategy: "aggressive",
      authenticator: new LegacyAuthenticator(),
      authTimeout: 1_000,
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
