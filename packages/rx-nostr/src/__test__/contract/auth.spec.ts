import type * as Nostr from "nostr-typedef";
import {
  NoopReconnector,
  NoopVerifier,
  RxNostr,
  RxNostrCallbackError,
  SimpleAuthenticator,
  type EventSigner,
  type RxNostrConfig,
} from "rx-nostr";
import { describe, expect, test, vi } from "vitest";
import { ControlledWebSocketServer, expectSent, Faker } from "../helper/index.ts";

const relay = "wss://relay.example.com";

function authEvent(id: string, challenge: string): Nostr.Event<22242> {
  return Faker.authEvent({
    id,
    pubkey: "auth-pubkey",
    created_at: 1,
    relay,
    challenge,
    content: "",
    sig: "auth-signature",
  });
}

function createRxNostr(
  server: ControlledWebSocketServer,
  overrides: Partial<RxNostrConfig> = {},
): RxNostr {
  return new RxNostr({
    verifier: new NoopVerifier(),
    reconnector: new NoopReconnector(),
    defaultOptions: { req: { linger: 0 } },
    skipFetchNip11: true,
    WebSocket: server.WebSocket,
    ...overrides,
  });
}

describe("NIP-42 AUTH public contract", () => {
  test("deduplicates a challenge across REQs and resends each REQ only once", async () => {
    const server = new ControlledWebSocketServer();
    const challenge = vi.fn(async (_url: string, value: string) => authEvent("auth-event", value));
    const rxNostr = createRxNostr(server, {
      authenticator: { challenge, authTimeout: 1_000 },
    });
    const completed = [vi.fn(), vi.fn()];
    rxNostr.req(relay, { strategy: "oneshot", filters: [{}] }).subscribe({
      complete: completed[0],
    });
    rxNostr.req(relay, { strategy: "oneshot", filters: [{}] }).subscribe({
      complete: completed[1],
    });
    server.sockets.latest.open();
    await expectSent(server.sockets.latest, "REQ", 2);
    const requests = server.sockets.latest.sentOfType("REQ");

    server.sockets.latest.message(["AUTH", "challenge-1"]);
    for (const request of requests) {
      server.sockets.latest.message(["CLOSED", request[1], "auth-required: authenticate first"]);
    }

    const auth = await expectSent(server.sockets.latest, "AUTH");
    expect(challenge).toHaveBeenCalledOnce();
    expect(challenge).toHaveBeenCalledWith(relay, "challenge-1");
    expect(auth).toEqual(["AUTH", authEvent("auth-event", "challenge-1")]);

    server.sockets.latest.message(["OK", "auth-event", true, "authenticated"]);
    await expectSent(server.sockets.latest, "REQ", 4);

    for (const request of requests) {
      server.sockets.latest.message(["CLOSED", request[1], "auth-required: still rejected"]);
    }
    await vi.waitFor(() => {
      expect(completed[0]).toHaveBeenCalledOnce();
      expect(completed[1]).toHaveBeenCalledOnce();
    });
    expect(challenge).toHaveBeenCalledOnce();
    expect(server.sockets.latest.sentOfType("AUTH")).toHaveLength(1);
    rxNostr.dispose();
  });

  test("does not invoke a signer or authenticator when AUTH is disabled", async () => {
    const server = new ControlledWebSocketServer();
    const signEvent = vi.fn();
    const signer: EventSigner = {
      signEvent: async () => {
        signEvent();
        throw new Error("must not sign");
      },
      getPublicKey: async () => "unused",
    };
    const challenge = vi.fn(async () => authEvent("unused", "unused"));
    const rxNostr = createRxNostr(server, {
      signer,
      authenticator: { challenge },
    });
    const complete = vi.fn();
    rxNostr
      .req(relay, { strategy: "oneshot", filters: [{}] }, { authenticator: false })
      .subscribe({ complete });
    server.sockets.latest.open();
    const [, subId] = await expectSent(server.sockets.latest, "REQ");
    server.sockets.latest.message(["AUTH", "challenge"]);
    server.sockets.latest.message(["CLOSED", subId, "auth-required: login"]);

    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(challenge).not.toHaveBeenCalled();
    expect(signEvent).not.toHaveBeenCalled();
    expect(server.sockets.latest.sent).toHaveLength(1);
    rxNostr.dispose();
  });

  test("resolves an authenticator factory with the normalized relay", async () => {
    const server = new ControlledWebSocketServer();
    const factory = vi.fn(() => undefined);
    const rxNostr = createRxNostr(server, {
      authenticator: factory,
    });
    const complete = vi.fn();
    rxNostr
      .req("wss://RELAY.example.com/", { strategy: "oneshot", filters: [{}] })
      .subscribe({ complete });
    server.sockets.latest.open();
    const [, subId] = await expectSent(server.sockets.latest, "REQ");
    server.sockets.latest.message(["AUTH", "challenge"]);
    server.sockets.latest.message(["CLOSED", subId, "auth-required: login"]);

    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(factory).toHaveBeenCalledOnce();
    expect(factory).toHaveBeenCalledWith(relay);
    expect(server.sockets.latest.sent).toHaveLength(1);
    rxNostr.dispose();
  });

  test("SimpleAuthenticator signs the required kind and relay/challenge tags", async () => {
    const signEvent = vi.fn();
    const signer: EventSigner = {
      async signEvent<K extends number>(params: Nostr.EventParameters<K>) {
        signEvent(params);
        return {
          id: "signed-id",
          pubkey: "signer-pubkey",
          created_at: 1,
          kind: params.kind,
          tags: params.tags ?? [],
          content: params.content,
          sig: "signer-signature",
        };
      },
      getPublicKey: async () => "signer-pubkey",
    };
    const authenticator = new SimpleAuthenticator(signer);
    const immediateAuthenticator = new SimpleAuthenticator(signer, { authTimeout: 0 });

    const result = await authenticator.challenge(relay, "challenge-value");

    expect(authenticator.authTimeout).toBe(30_000);
    expect(immediateAuthenticator.authTimeout).toBe(0);
    expect(signEvent).toHaveBeenCalledWith({
      kind: 22242,
      content: "",
      tags: [
        ["relay", relay],
        ["challenge", "challenge-value"],
      ],
    });
    expect(result).toMatchObject({
      kind: 22242,
      pubkey: "signer-pubkey",
      sig: "signer-signature",
    });
  });

  test.each([
    { outcome: "rejected", authTimeout: 1_000 },
    { outcome: "timeout", authTimeout: 5 },
  ] as const)(
    "treats an AUTH $outcome as relay-local completion",
    async ({ outcome, authTimeout }) => {
      const server = new ControlledWebSocketServer();
      const rxNostr = createRxNostr(server, {
        authenticator: {
          authTimeout,
          challenge: async (_url, value) => authEvent("auth-failure", value),
        },
      });
      const complete = vi.fn();
      const error = vi.fn();
      rxNostr.req(relay, { strategy: "oneshot", filters: [{}] }).subscribe({
        complete,
        error,
      });
      server.sockets.latest.open();
      const [, subId] = await expectSent(server.sockets.latest, "REQ");
      server.sockets.latest.message(["AUTH", "challenge"]);
      server.sockets.latest.message(["CLOSED", subId, "auth-required: login"]);
      await expectSent(server.sockets.latest, "AUTH");
      if (outcome === "rejected") {
        server.sockets.latest.message(["OK", "auth-failure", false, "denied"]);
      }

      await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
      expect(error).not.toHaveBeenCalled();
      expect(server.sockets.latest.sent).toHaveLength(2);
      rxNostr.dispose();
    },
  );

  test("does not send an AUTH event from a challenge invalidated by reconnect", async () => {
    const server = new ControlledWebSocketServer();
    let resolveAuth!: (event: Nostr.Event<22242>) => void;
    const rxNostr = createRxNostr(server, {
      authenticator: {
        challenge: () =>
          new Promise<Nostr.Event<22242>>((resolve) => {
            resolveAuth = resolve;
          }),
      },
      reconnector: { reconnect: () => ({ action: "retry", delay: 0 }) },
    });
    const complete = vi.fn();
    rxNostr.req(relay, { strategy: "oneshot", filters: [{}] }).subscribe({ complete });
    server.sockets.latest.open();
    const firstConnection = server.sockets.latest;
    const [, subId] = await expectSent(firstConnection, "REQ");
    firstConnection.message(["AUTH", "old-challenge"]);
    firstConnection.message(["CLOSED", subId, "auth-required: login"]);
    await vi.waitFor(() => expect(resolveAuth).toBeTypeOf("function"));

    firstConnection.peerClose(1006, "offline");
    await vi.waitFor(() => expect(server.connections).toHaveLength(2));
    resolveAuth(authEvent("stale-auth", "old-challenge"));

    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(firstConnection.sent).toHaveLength(1);
    expect(server.sockets.latest.sent).toHaveLength(0);
    rxNostr.dispose();
  });

  test("wraps authenticator errors and rejects stale challenge work", async () => {
    const callbackServer = new ControlledWebSocketServer();
    const cause = new Error("authenticator failed");
    const callbackRxNostr = createRxNostr(callbackServer, {
      authenticator: { challenge: async () => Promise.reject(cause) },
    });
    let received: unknown;
    callbackRxNostr.req(relay, { strategy: "oneshot", filters: [{}] }).subscribe({
      error: (error) => (received = error),
    });
    callbackServer.sockets.latest.open();
    const [, subId] = await expectSent(callbackServer.sockets.latest, "REQ");
    callbackServer.sockets.latest.message(["AUTH", "challenge"]);
    callbackServer.sockets.latest.message(["CLOSED", subId, "auth-required: login"]);
    await vi.waitFor(() => expect(received).toBeInstanceOf(RxNostrCallbackError));
    expect(received).toMatchObject({ callback: "authenticator", cause });
    callbackRxNostr.dispose();

    const staleServer = new ControlledWebSocketServer();
    let resolveAuth!: (event: Nostr.Event<22242>) => void;
    const staleRxNostr = createRxNostr(staleServer, {
      authenticator: {
        challenge: () =>
          new Promise<Nostr.Event<22242>>((resolve) => {
            resolveAuth = resolve;
          }),
      },
    });
    const complete = vi.fn();
    staleRxNostr.req(relay, { strategy: "oneshot", filters: [{}] }).subscribe({
      complete,
    });
    staleServer.sockets.latest.open();
    const [, staleSubId] = await expectSent(staleServer.sockets.latest, "REQ");
    staleServer.sockets.latest.message(["AUTH", "old"]);
    staleServer.sockets.latest.message(["CLOSED", staleSubId, "auth-required: login"]);
    await vi.waitFor(() => expect(resolveAuth).toBeTypeOf("function"));
    staleServer.sockets.latest.message(["AUTH", "new"]);
    resolveAuth(authEvent("old-auth", "old"));

    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(staleServer.sockets.latest.sent).toHaveLength(1);
    staleRxNostr.dispose();
  });

  test("cancels the AUTH effort when its last operation unsubscribes", async () => {
    const server = new ControlledWebSocketServer();
    let resolveAuth!: (event: Nostr.Event<22242>) => void;
    const rxNostr = createRxNostr(server, {
      authenticator: {
        challenge: () =>
          new Promise<Nostr.Event<22242>>((resolve) => {
            resolveAuth = resolve;
          }),
      },
    });
    const subscription = rxNostr.req(relay, { strategy: "oneshot", filters: [{}] }).subscribe();
    server.sockets.latest.open();
    const [, subId] = await expectSent(server.sockets.latest, "REQ");
    server.sockets.latest.message(["AUTH", "challenge"]);
    server.sockets.latest.message(["CLOSED", subId, "auth-required: login"]);
    await vi.waitFor(() => expect(resolveAuth).toBeTypeOf("function"));

    subscription.unsubscribe();
    resolveAuth(authEvent("cancelled-auth", "challenge"));
    await Promise.resolve();
    await Promise.resolve();

    expect(server.sockets.latest.sent).toHaveLength(1);
    rxNostr.dispose();
  });
});
