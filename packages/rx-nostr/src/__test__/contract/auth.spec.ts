import type * as Nostr from "nostr-typedef";
import {
  RxNostrCallbackError,
  SimpleAuthenticator,
  type EventSigner,
  type RxNostrConfig,
} from "rx-nostr";
import { describe, expect, test, vi } from "vitest";
import {
  createDeferred,
  createRxNostrScenario,
  expectCallbackCalled,
  expectConnectionCount,
  expectObservableCompleted,
  expectSent,
  Faker,
} from "../helper/index.ts";

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

function createAuthScenario(overrides: Partial<RxNostrConfig> = {}) {
  return createRxNostrScenario({
    defaultOptions: { req: { linger: 0 } },
    ...overrides,
  });
}

describe("NIP-42 AUTH public contract", () => {
  describe("handshake", () => {
    test("deduplicates a challenge across REQs and resends each REQ only once", async () => {
      const challenge = vi.fn(async (_url: string, value: string) =>
        authEvent("auth-event", value),
      );
      const { server, rxNostr } = createAuthScenario({
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

      const retriedRequests = server.sockets.latest.sentOfType("REQ").slice(2);
      for (const request of retriedRequests) {
        server.sockets.latest.message(["CLOSED", request[1], "auth-required: still rejected"]);
      }

      await Promise.all(completed.map((callback) => expectObservableCompleted(callback)));
      expect(challenge).toHaveBeenCalledOnce();
      expect(server.sockets.latest.sentOfType("AUTH")).toHaveLength(1);

      rxNostr.dispose();
    });

    test.each([
      { outcome: "rejected", authTimeout: 1_000 },
      { outcome: "timeout", authTimeout: 5 },
    ] as const)(
      "treats an AUTH $outcome as relay-local completion",
      async ({ outcome, authTimeout }) => {
        const { server, rxNostr } = createAuthScenario({
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

        await expectObservableCompleted(complete, error);
        expect(server.sockets.latest.sent).toHaveLength(2);

        rxNostr.dispose();
      },
    );
  });

  describe("configuration", () => {
    test("does not invoke a signer or authenticator when AUTH is disabled", async () => {
      const signEvent = vi.fn();
      const signer: EventSigner = {
        signEvent: async () => {
          signEvent();
          throw new Error("must not sign");
        },
        getPublicKey: async () => "unused",
      };
      const challenge = vi.fn(async () => authEvent("unused", "unused"));
      const { server, rxNostr } = createAuthScenario({
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

      await expectObservableCompleted(complete);
      expect(challenge).not.toHaveBeenCalled();
      expect(signEvent).not.toHaveBeenCalled();
      expect(server.sockets.latest.sent).toHaveLength(1);

      rxNostr.dispose();
    });

    test("resolves an authenticator factory with the normalized relay", async () => {
      const factory = vi.fn(() => undefined);
      const { server, rxNostr } = createAuthScenario({
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

      await expectObservableCompleted(complete);
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
  });

  describe("stale work and cancellation", () => {
    test("does not send an AUTH event from a challenge invalidated by reconnect", async () => {
      const auth = createDeferred<Nostr.Event<22242>>();
      const challenge = vi.fn(() => auth.promise);
      const { server, rxNostr } = createAuthScenario({
        authenticator: {
          challenge,
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
      await expectCallbackCalled(challenge);

      firstConnection.peerClose(1006, "offline");
      await expectConnectionCount(server, 2);
      auth.resolve(authEvent("stale-auth", "old-challenge"));

      await expectObservableCompleted(complete);
      expect(firstConnection.sent).toHaveLength(1);
      expect(server.sockets.latest.sent).toHaveLength(0);

      rxNostr.dispose();
    });

    test("wraps authenticator errors as callback errors", async () => {
      const cause = new Error("authenticator failed");
      const { server, rxNostr } = createAuthScenario({
        authenticator: { challenge: async () => Promise.reject(cause) },
      });
      const error = vi.fn();

      rxNostr.req(relay, { strategy: "oneshot", filters: [{}] }).subscribe({
        error,
      });

      server.sockets.latest.open();
      const [, subId] = await expectSent(server.sockets.latest, "REQ");
      server.sockets.latest.message(["AUTH", "challenge"]);
      server.sockets.latest.message(["CLOSED", subId, "auth-required: login"]);

      await expectCallbackCalled(error);
      expect(error).toHaveBeenCalledWith(expect.any(RxNostrCallbackError));
      expect(error.mock.calls[0]![0]).toMatchObject({ callback: "authenticator", cause });

      rxNostr.dispose();
    });

    test("rejects stale challenge work after a newer challenge", async () => {
      const auth = createDeferred<Nostr.Event<22242>>();
      const challenge = vi.fn(() => auth.promise);
      const { server, rxNostr } = createAuthScenario({
        authenticator: {
          challenge,
        },
      });
      const complete = vi.fn();

      rxNostr.req(relay, { strategy: "oneshot", filters: [{}] }).subscribe({
        complete,
      });

      server.sockets.latest.open();
      const [, subId] = await expectSent(server.sockets.latest, "REQ");
      server.sockets.latest.message(["AUTH", "old"]);
      server.sockets.latest.message(["CLOSED", subId, "auth-required: login"]);
      await expectCallbackCalled(challenge);
      server.sockets.latest.message(["AUTH", "new"]);
      auth.resolve(authEvent("old-auth", "old"));

      await expectObservableCompleted(complete);
      expect(server.sockets.latest.sent).toHaveLength(1);

      rxNostr.dispose();
    });

    test("cancels the AUTH effort when its last operation unsubscribes", async () => {
      const auth = createDeferred<Nostr.Event<22242>>();
      const challenge = vi.fn(() => auth.promise);
      const { server, rxNostr } = createAuthScenario({
        authenticator: {
          challenge,
        },
      });

      const subscription = rxNostr.req(relay, { strategy: "oneshot", filters: [{}] }).subscribe();

      server.sockets.latest.open();
      const [, subId] = await expectSent(server.sockets.latest, "REQ");
      server.sockets.latest.message(["AUTH", "challenge"]);
      server.sockets.latest.message(["CLOSED", subId, "auth-required: login"]);
      await expectCallbackCalled(challenge);

      subscription.unsubscribe();
      auth.resolve(authEvent("cancelled-auth", "challenge"));
      await Promise.resolve();
      await Promise.resolve();

      expect(server.sockets.latest.sent).toHaveLength(1);

      rxNostr.dispose();
    });
  });
});
