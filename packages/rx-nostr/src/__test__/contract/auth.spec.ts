import type * as Nostr from "nostr-typedef";
import {
  NoopRetryer,
  NoopVerifier,
  RxNostr,
  RxNostrCallbackError,
  SimpleAuthenticator,
  type EventSigner,
} from "rx-nostr";
import { describe, expect, test, vi } from "vitest";
import { ControlledWebSocketServer } from "../support/controlled-websocket.ts";

const relay = "wss://relay.example.com";

function authEvent(id: string, challenge: string): Nostr.Event<22242> {
  return {
    id,
    pubkey: "auth-pubkey",
    created_at: 1,
    kind: 22242,
    tags: [
      ["relay", relay],
      ["challenge", challenge],
    ],
    content: "",
    sig: "auth-signature",
  };
}

describe("NIP-42 AUTH public contract", () => {
  test("deduplicates a challenge across REQs and resends each REQ only once", async () => {
    const server = new ControlledWebSocketServer();
    const challenge = vi.fn(async (_url: string, value: string) => authEvent("auth-event", value));
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      retry: new NoopRetryer(),
      authenticator: { challenge },
      authTimeout: 1_000,
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const completed = [vi.fn(), vi.fn()];
    rxNostr.req([{}], { relays: relay, linger: 0 }).subscribe({
      complete: completed[0],
    });
    rxNostr.req([{}], { relays: relay, linger: 0 }).subscribe({
      complete: completed[1],
    });
    server.latestConnection.open();
    await vi.waitFor(() => expect(server.latestConnection.sent).toHaveLength(2));
    const requests = server.latestConnection.sent.map(
      (value) => JSON.parse(value as string) as ["REQ", string],
    );

    server.latestConnection.message(JSON.stringify(["AUTH", "challenge-1"]));
    for (const request of requests) {
      server.latestConnection.message(
        JSON.stringify(["CLOSED", request[1], "auth-required: authenticate first"]),
      );
    }

    await vi.waitFor(() => expect(server.latestConnection.sent).toHaveLength(3));
    expect(challenge).toHaveBeenCalledOnce();
    expect(challenge).toHaveBeenCalledWith(relay, "challenge-1");
    const auth = JSON.parse(server.latestConnection.sent[2] as string) as [
      "AUTH",
      Nostr.Event<22242>,
    ];
    expect(auth).toEqual(["AUTH", authEvent("auth-event", "challenge-1")]);

    server.latestConnection.message(JSON.stringify(["OK", "auth-event", true, "authenticated"]));
    await vi.waitFor(() => expect(server.latestConnection.sent).toHaveLength(5));
    expect(
      server.latestConnection.sent
        .map((value) => JSON.parse(value as string))
        .filter(([type]) => type === "REQ"),
    ).toHaveLength(4);

    for (const request of requests) {
      server.latestConnection.message(
        JSON.stringify(["CLOSED", request[1], "auth-required: still rejected"]),
      );
    }
    await vi.waitFor(() => {
      expect(completed[0]).toHaveBeenCalledOnce();
      expect(completed[1]).toHaveBeenCalledOnce();
    });
    expect(challenge).toHaveBeenCalledOnce();
    expect(
      server.latestConnection.sent
        .map((value) => JSON.parse(value as string))
        .filter(([type]) => type === "AUTH"),
    ).toHaveLength(1);
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
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      signer,
      authenticator: { challenge },
      retry: new NoopRetryer(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const complete = vi.fn();
    rxNostr.req([{}], { relays: relay, authenticator: false, linger: 0 }).subscribe({ complete });
    server.latestConnection.open();
    await vi.waitFor(() => expect(server.latestConnection.sent).toHaveLength(1));
    const [, subId] = JSON.parse(server.latestConnection.sent[0] as string) as ["REQ", string];
    server.latestConnection.message(JSON.stringify(["AUTH", "challenge"]));
    server.latestConnection.message(JSON.stringify(["CLOSED", subId, "auth-required: login"]));

    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(challenge).not.toHaveBeenCalled();
    expect(signEvent).not.toHaveBeenCalled();
    expect(server.latestConnection.sent).toHaveLength(1);
    rxNostr.dispose();
  });

  test("resolves an authenticator factory with the normalized relay", async () => {
    const server = new ControlledWebSocketServer();
    const factory = vi.fn(() => undefined);
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      authenticator: factory,
      retry: new NoopRetryer(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const complete = vi.fn();
    rxNostr.req([{}], { relays: "wss://RELAY.example.com/", linger: 0 }).subscribe({ complete });
    server.latestConnection.open();
    await vi.waitFor(() => expect(server.latestConnection.sent).toHaveLength(1));
    const [, subId] = JSON.parse(server.latestConnection.sent[0] as string) as ["REQ", string];
    server.latestConnection.message(JSON.stringify(["AUTH", "challenge"]));
    server.latestConnection.message(JSON.stringify(["CLOSED", subId, "auth-required: login"]));

    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(factory).toHaveBeenCalledOnce();
    expect(factory).toHaveBeenCalledWith(relay);
    expect(server.latestConnection.sent).toHaveLength(1);
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

    const result = await authenticator.challenge(relay, "challenge-value");

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
      const rxNostr = new RxNostr({
        verifier: new NoopVerifier(),
        authenticator: {
          challenge: async (_url, value) => authEvent("auth-failure", value),
        },
        authTimeout,
        retry: new NoopRetryer(),
        skipFetchNip11: true,
        WebSocket: server.WebSocket,
      });
      const complete = vi.fn();
      const error = vi.fn();
      rxNostr.req([{}], { relays: relay, linger: 0 }).subscribe({
        complete,
        error,
      });
      server.latestConnection.open();
      await vi.waitFor(() => expect(server.latestConnection.sent).toHaveLength(1));
      const [, subId] = JSON.parse(server.latestConnection.sent[0] as string) as ["REQ", string];
      server.latestConnection.message(JSON.stringify(["AUTH", "challenge"]));
      server.latestConnection.message(JSON.stringify(["CLOSED", subId, "auth-required: login"]));
      await vi.waitFor(() => expect(server.latestConnection.sent).toHaveLength(2));
      if (outcome === "rejected") {
        server.latestConnection.message(JSON.stringify(["OK", "auth-failure", false, "denied"]));
      }

      await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
      expect(error).not.toHaveBeenCalled();
      expect(server.latestConnection.sent).toHaveLength(2);
      rxNostr.dispose();
    },
  );

  test("does not send an AUTH event from a challenge invalidated by reconnect", async () => {
    const server = new ControlledWebSocketServer();
    let resolveAuth!: (event: Nostr.Event<22242>) => void;
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      authenticator: {
        challenge: () =>
          new Promise<Nostr.Event<22242>>((resolve) => {
            resolveAuth = resolve;
          }),
      },
      retry: { retry: () => ({ action: "retry", delay: 0 }) },
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const complete = vi.fn();
    rxNostr.req([{}], { relays: relay, linger: 0 }).subscribe({ complete });
    server.latestConnection.open();
    await vi.waitFor(() => expect(server.latestConnection.sent).toHaveLength(1));
    const firstConnection = server.latestConnection;
    const [, subId] = JSON.parse(firstConnection.sent[0] as string) as ["REQ", string];
    firstConnection.message(JSON.stringify(["AUTH", "old-challenge"]));
    firstConnection.message(JSON.stringify(["CLOSED", subId, "auth-required: login"]));
    await vi.waitFor(() => expect(resolveAuth).toBeTypeOf("function"));

    firstConnection.peerClose(1006, "offline");
    await vi.waitFor(() => expect(server.connections).toHaveLength(2));
    resolveAuth(authEvent("stale-auth", "old-challenge"));

    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(firstConnection.sent).toHaveLength(1);
    expect(server.latestConnection.sent).toHaveLength(0);
    rxNostr.dispose();
  });

  test("wraps authenticator errors and rejects stale challenge work", async () => {
    const callbackServer = new ControlledWebSocketServer();
    const cause = new Error("authenticator failed");
    const callbackRxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      authenticator: { challenge: async () => Promise.reject(cause) },
      retry: new NoopRetryer(),
      skipFetchNip11: true,
      WebSocket: callbackServer.WebSocket,
    });
    let received: unknown;
    callbackRxNostr.req([{}], { relays: relay, linger: 0 }).subscribe({
      error: (error) => (received = error),
    });
    callbackServer.latestConnection.open();
    await vi.waitFor(() => expect(callbackServer.latestConnection.sent).toHaveLength(1));
    const [, subId] = JSON.parse(callbackServer.latestConnection.sent[0] as string) as [
      "REQ",
      string,
    ];
    callbackServer.latestConnection.message(JSON.stringify(["AUTH", "challenge"]));
    callbackServer.latestConnection.message(
      JSON.stringify(["CLOSED", subId, "auth-required: login"]),
    );
    await vi.waitFor(() => expect(received).toBeInstanceOf(RxNostrCallbackError));
    expect(received).toMatchObject({ callback: "authenticator", cause });
    callbackRxNostr.dispose();

    const staleServer = new ControlledWebSocketServer();
    let resolveAuth!: (event: Nostr.Event<22242>) => void;
    const staleRxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      authenticator: {
        challenge: () =>
          new Promise<Nostr.Event<22242>>((resolve) => {
            resolveAuth = resolve;
          }),
      },
      retry: new NoopRetryer(),
      skipFetchNip11: true,
      WebSocket: staleServer.WebSocket,
    });
    const complete = vi.fn();
    staleRxNostr.req([{}], { relays: relay, linger: 0 }).subscribe({
      complete,
    });
    staleServer.latestConnection.open();
    await vi.waitFor(() => expect(staleServer.latestConnection.sent).toHaveLength(1));
    const [, staleSubId] = JSON.parse(staleServer.latestConnection.sent[0] as string) as [
      "REQ",
      string,
    ];
    staleServer.latestConnection.message(JSON.stringify(["AUTH", "old"]));
    staleServer.latestConnection.message(
      JSON.stringify(["CLOSED", staleSubId, "auth-required: login"]),
    );
    await vi.waitFor(() => expect(resolveAuth).toBeTypeOf("function"));
    staleServer.latestConnection.message(JSON.stringify(["AUTH", "new"]));
    resolveAuth(authEvent("old-auth", "old"));

    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(staleServer.latestConnection.sent).toHaveLength(1);
    staleRxNostr.dispose();
  });

  test("cancels the AUTH effort when its last operation unsubscribes", async () => {
    const server = new ControlledWebSocketServer();
    let resolveAuth!: (event: Nostr.Event<22242>) => void;
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      authenticator: {
        challenge: () =>
          new Promise<Nostr.Event<22242>>((resolve) => {
            resolveAuth = resolve;
          }),
      },
      retry: new NoopRetryer(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const subscription = rxNostr.req([{}], { relays: relay, linger: 0 }).subscribe();
    server.latestConnection.open();
    await vi.waitFor(() => expect(server.latestConnection.sent).toHaveLength(1));
    const [, subId] = JSON.parse(server.latestConnection.sent[0] as string) as ["REQ", string];
    server.latestConnection.message(JSON.stringify(["AUTH", "challenge"]));
    server.latestConnection.message(JSON.stringify(["CLOSED", subId, "auth-required: login"]));
    await vi.waitFor(() => expect(resolveAuth).toBeTypeOf("function"));

    subscription.unsubscribe();
    resolveAuth(authEvent("cancelled-auth", "challenge"));
    await Promise.resolve();
    await Promise.resolve();

    expect(server.latestConnection.sent).toHaveLength(1);
    rxNostr.dispose();
  });
});
