import type * as Nostr from "nostr-typedef";
import {
  RxNostrCallbackError,
  SimpleAuthenticator,
  type EventPacket,
  type EventSigner,
  type RxNostrConfig,
} from "rx-nostr";
import { describe, expect, test, vi } from "vitest";

import {
  createDeferred,
  createRxNostrScenario,
  expectCallbackCalled,
  Faker,
} from "../helper/index.ts";
import { settleProtocol, scenarioTest } from "../helper/protocol-scenario.ts";
import { SubscriptionInspector } from "../helper/subscription-inspector.ts";

const a = "wss://a.example.com";

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
      const inspectors = [
        new SubscriptionInspector<unknown>(),
        new SubscriptionInspector<unknown>(),
      ];

      rxNostr.backward(relay, [{}]).subscribe(inspectors[0]);
      rxNostr.backward(relay, [{}]).subscribe(inspectors[1]);

      const socket = server.sockets.latest;

      socket.open();
      const requests = [await socket.inbox.waitNext("REQ"), await socket.inbox.waitNext("REQ")];

      socket.message(["AUTH", "challenge-1"]);

      for (const request of requests) {
        socket.message(["CLOSED", request[1], "auth-required: authenticate first"]);
      }

      const auth = await socket.inbox.waitNext("AUTH");

      expect(challenge).toHaveBeenCalledOnce();
      expect(challenge).toHaveBeenCalledWith(relay, "challenge-1");
      expect(auth).toEqual(["AUTH", authEvent("auth-event", "challenge-1")]);

      socket.message(["OK", "auth-event", true, "authenticated"]);
      const retriedRequests = [
        await socket.inbox.waitNext("REQ"),
        await socket.inbox.waitNext("REQ"),
      ];

      for (const request of retriedRequests) {
        socket.message(["CLOSED", request[1], "auth-required: still rejected"]);
      }

      await Promise.all(
        inspectors.map((inspector) => expect(inspector.waitComplete()).resolves.toBeUndefined()),
      );
      expect(challenge).toHaveBeenCalledOnce();
      expect(socket.inbox.length).toBe(5);

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
        const inspector = new SubscriptionInspector<EventPacket>();

        rxNostr.backward(relay, [{}]).subscribe(inspector);

        const socket = server.sockets.latest;

        socket.open();
        const [, subId] = await socket.inbox.waitNext("REQ");

        socket.message(["AUTH", "challenge"]);
        socket.message(["CLOSED", subId, "auth-required: login"]);
        await expect(socket.inbox.waitNext()).resolves.toHaveProperty("0", "AUTH");

        if (outcome === "rejected") {
          socket.message(["OK", "auth-failure", false, "denied"]);
        }

        await expect(inspector.waitComplete()).resolves.toBeUndefined();
        expect(socket.inbox.length).toBe(2);

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
        authenticator: false,
      });
      const inspector = new SubscriptionInspector<EventPacket>();

      rxNostr.backward(relay, [{}]).subscribe(inspector);

      const socket = server.sockets.latest;

      socket.open();
      const [, subId] = await socket.inbox.waitNext("REQ");

      socket.message(["AUTH", "challenge"]);
      socket.message(["CLOSED", subId, "auth-required: login"]);

      await expect(inspector.waitComplete()).resolves.toBeUndefined();
      expect(challenge).not.toHaveBeenCalled();
      expect(signEvent).not.toHaveBeenCalled();
      expect(socket.inbox.length).toBe(1);

      rxNostr.dispose();
    });

    test("resolves an authenticator factory with the normalized relay", async () => {
      const factory = vi.fn(() => undefined);
      const { server, rxNostr } = createAuthScenario({
        authenticator: factory,
      });
      const inspector = new SubscriptionInspector<EventPacket>();

      rxNostr.backward("wss://RELAY.example.com/", [{}]).subscribe(inspector);

      const socket = server.sockets.latest;

      socket.open();
      const [, subId] = await socket.inbox.waitNext("REQ");

      socket.message(["AUTH", "challenge"]);
      socket.message(["CLOSED", subId, "auth-required: login"]);

      await expect(inspector.waitComplete()).resolves.toBeUndefined();
      expect(factory).toHaveBeenCalledOnce();
      expect(factory).toHaveBeenCalledWith(relay);
      expect(socket.inbox.length).toBe(1);

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
      const inspector = new SubscriptionInspector<EventPacket>();

      rxNostr.backward(relay, [{}]).subscribe(inspector);

      const firstConnection = server.sockets.latest;

      firstConnection.open();
      const [, subId] = await firstConnection.inbox.waitNext("REQ");

      firstConnection.message(["AUTH", "old-challenge"]);
      firstConnection.message(["CLOSED", subId, "auth-required: login"]);
      await expectCallbackCalled(challenge);

      firstConnection.peerClose(1006, "offline");
      await expect(server.connections.wait(1)).resolves.toBeDefined();
      const secondConnection = server.sockets.latest;

      auth.resolve(authEvent("stale-auth", "old-challenge"));

      await expect(inspector.waitComplete()).resolves.toBeUndefined();
      expect(firstConnection.inbox.length).toBe(1);
      expect(secondConnection.inbox.length).toBe(0);

      rxNostr.dispose();
    });

    test("wraps authenticator errors as callback errors", async () => {
      const cause = new Error("authenticator failed");
      const { server, rxNostr } = createAuthScenario({
        authenticator: { challenge: async () => Promise.reject(cause) },
      });
      const inspector = new SubscriptionInspector<EventPacket>();

      rxNostr.backward(relay, [{}]).subscribe(inspector);

      const socket = server.sockets.latest;

      socket.open();
      const [, subId] = await socket.inbox.waitNext("REQ");

      socket.message(["AUTH", "challenge"]);
      socket.message(["CLOSED", subId, "auth-required: login"]);
      await expect(inspector.waitError()).resolves.toEqual(expect.any(RxNostrCallbackError));
      expect(await inspector.waitError()).toMatchObject({ callback: "authenticator", cause });

      rxNostr.dispose();
    });

    test("replaces stale signature work and retries only after the new challenge succeeds", async () => {
      const oldAuth = createDeferred<Nostr.Event<22242>>();
      const newAuth = createDeferred<Nostr.Event<22242>>();
      const challenge = vi.fn((_relay: string, value: string) =>
        value === "old" ? oldAuth.promise : newAuth.promise,
      );
      const { server, rxNostr } = createAuthScenario({ authenticator: { challenge } });
      const inspector = new SubscriptionInspector<EventPacket>();

      rxNostr.backward(relay, [{}]).subscribe(inspector);
      const socket = server.sockets.latest;

      socket.open();
      const [, subId] = await socket.inbox.waitNext("REQ");

      socket.message(["AUTH", "old"]);
      socket.message(["CLOSED", subId, "auth-required: login"]);
      await expectCallbackCalled(challenge);
      socket.message(["AUTH", "new"]);
      await expectCallbackCalled(challenge, 2);
      oldAuth.resolve(authEvent("old-auth", "old"));
      newAuth.resolve(authEvent("new-auth", "new"));
      expect(await socket.inbox.waitNext("AUTH")).toEqual(["AUTH", authEvent("new-auth", "new")]);
      expect(inspector.completed).toBe(false);
      socket.message(["OK", "new-auth", true, "authenticated"]);
      const [, retryId] = await socket.inbox.waitNext("REQ");

      socket.message(["EOSE", retryId]);
      await expect(inspector.waitComplete()).resolves.toBeUndefined();
      expect(socket.inbox.length).toBe(3);
      rxNostr.dispose();
    });

    test("discards pending AUTH when cancellation releases the last connection demand", async () => {
      const auth = createDeferred<Nostr.Event<22242>>();
      const challenge = vi.fn(() => auth.promise);
      const { server, rxNostr } = createAuthScenario({
        authenticator: {
          challenge,
        },
      });

      const inspector = new SubscriptionInspector<EventPacket>();
      const subscription = rxNostr.backward(relay, [{}]).subscribe(inspector);

      const socket = server.sockets.latest;

      socket.open();
      const [, subId] = await socket.inbox.waitNext("REQ");

      socket.message(["AUTH", "challenge"]);
      socket.message(["CLOSED", subId, "auth-required: login"]);
      await expectCallbackCalled(challenge);

      subscription.unsubscribe();
      auth.resolve(authEvent("cancelled-auth", "challenge"));
      await Promise.resolve();
      await Promise.resolve();

      expect(socket.inbox.length).toBe(1);

      rxNostr.dispose();
    });
  });

  describe("shared authentication", () => {
    scenarioTest(
      "keeps shared authentication alive when only one waiting query unsubscribes",
      async ({ createScenario }) => {
        const auth = createDeferred<ReturnType<typeof Faker.authEvent>>();
        const challenge = vi.fn(() => auth.promise);
        const { rxNostr, server } = createScenario({ authenticator: { challenge } });
        const firstInspector = new SubscriptionInspector<EventPacket>();
        const first = rxNostr.backward(a, [{ kinds: [1] }]).subscribe(firstInspector);
        const secondInspector = new SubscriptionInspector<EventPacket>();

        rxNostr.backward(a, [{ kinds: [2] }]).subscribe(secondInspector);
        const socket = server.sockets.latest;

        socket.open();
        await settleProtocol();
        socket.message(["AUTH", "challenge"]);

        for (const req of [
          await socket.inbox.waitNext("REQ"),
          await socket.inbox.waitNext("REQ"),
        ]) {
          socket.message(["CLOSED", req[1], "auth-required: login"]);
        }

        await settleProtocol();
        expect(challenge).toHaveBeenCalledOnce();

        first.unsubscribe();
        const signed = Faker.authEvent({ id: "shared-auth" });

        auth.resolve(signed);
        await settleProtocol();
        await expect(socket.inbox.waitNext()).resolves.toEqual(["AUTH", signed]);
        socket.message(["OK", signed.id, true, "authenticated"]);
        await settleProtocol();
        const retried = await socket.inbox.waitNext("REQ");

        expect(retried[2]).toEqual({ kinds: [2] });
        expect(socket.inbox.length).toBe(4);
        socket.message(["EOSE", retried[1]]);
        await settleProtocol();
        expect(secondInspector.completed).toBe(true);
      },
    );
  });
});
