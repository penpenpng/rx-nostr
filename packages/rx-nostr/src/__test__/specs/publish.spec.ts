import { SeckeySigner, SimpleVerifier } from "@rx-nostr/crypto";
import type * as Nostr from "nostr-typedef";
import {
  RxNostrCallbackError,
  RxNostrPublicationError,
  NoopSigner,
  type EventSigner,
  type OkPacket,
  type Publication,
  type PublicationFailure,
} from "rx-nostr";
import { describe, expect, expectTypeOf, test, vi } from "vitest";

import {
  createPublicationScenario,
  createDeferred,
  Faker,
  publicationEvent as event,
  publicationRelay1 as relay1,
  publicationRelay2 as relay2,
  publicationSocket as socket,
} from "../helper/index.ts";
import { scenarioTest, settleProtocol } from "../helper/protocol-scenario.ts";
import { SubscriptionInspector } from "../helper/subscription-inspector.ts";

describe("Publication public contract", () => {
  scenarioTest(
    "publishes a real signed EVENT and settles on the relay OK",
    async ({ createScenario }) => {
      const verifier = new SimpleVerifier();
      const { rxNostr, server } = createScenario({
        verifier,
        signer: new SeckeySigner(
          "7f3fd51b45881fd8402fea2182f43fd3111a905180ff3a05a90645be6797b4f9",
        ),
      });
      const publication = rxNostr.publish(
        relay1,
        { kind: 1, content: "real publication" },
        { linger: 0 },
      );
      const completion = publication.waitFor("all");
      const connection = socket(server, relay1);

      connection.open();
      const [, signed] = await connection.inbox.waitNext("EVENT");

      await expect(verifier.verifyEvent(signed)).resolves.toBe(true);
      await expect(publication.event).resolves.toEqual(signed);

      connection.message(["OK", signed.id, true, "accepted"]);
      await expect(completion).resolves.toBeUndefined();
    },
  );

  describe("public values", () => {
    test.each([true, false])("isolates observer changes from a relay's OK %s", async (accepted) => {
      const { server, rxNostr } = createPublicationScenario();
      const first = rxNostr.publish(relay1, event());
      const second = rxNostr.publish(relay1, event());
      const observed: OkPacket[] = [];
      const replayed: OkPacket[] = [];
      const outcomes = [first, second].map((publication) =>
        publication.waitFor("all").then(
          () => "accepted",
          (error: unknown) => error,
        ),
      );

      first.subscribe((packet) => {
        packet.ok = !accepted;
        packet.eventId = "changed";
        packet.message[2] = !accepted;
      });
      first.subscribe((packet) => observed.push(packet));
      second.subscribe((packet) => observed.push(packet));

      try {
        const connection = socket(server, relay1);

        connection.open();
        await connection.inbox.waitNext("EVENT");
        await connection.inbox.waitNext("EVENT");
        connection.message(["OK", "event", accepted, "relay result"]);

        const results = await Promise.all(outcomes);

        for (const result of results) {
          if (accepted) {
            expect(result).toBe("accepted");
          } else {
            expect(result).toMatchObject({
              code: "not-all-accepted",
              failures: [{ kind: "rejected", ok: { ok: false, eventId: "event" } }],
            });
          }
        }

        first.subscribe((packet) => replayed.push(packet));

        expect([...observed, ...replayed]).toHaveLength(3);

        for (const packet of [...observed, ...replayed]) {
          expect(packet).toMatchObject({ ok: accepted, eventId: "event" });
          expect(packet.message).toEqual(["OK", "event", accepted, "relay result"]);
        }

        expect(replayed[0]).not.toBe(observed[0]);

        expect(replayed[0]!.message).not.toBe(observed[0]!.message);
      } finally {
        rxNostr.dispose();

        for (const connection of server.connections) {
          connection.acknowledgeClose();
        }
      }
    });

    test("exposes the signed event as a mutable event", () => {
      expectTypeOf<Publication["event"]>().toEqualTypeOf<Promise<Nostr.Event>>();
    });

    test("exposes mutable detached publication failures", () => {
      expectTypeOf<RxNostrPublicationError["failures"]>().toEqualTypeOf<PublicationFailure[]>();

      const source: PublicationFailure[] = [
        {
          relay: relay1,
          kind: "rejected",
          ok: {
            from: relay1,
            type: "OK",
            message: ["OK", "event", false, "blocked"],
            eventId: "event",
            ok: false,
            notice: "blocked",
          },
        },
      ];
      const error = new RxNostrPublicationError("not-all-accepted", source);

      source[0]!.kind = "cancelled";
      source[0]!.ok!.ok = true;

      source.push({ relay: relay2, kind: "timeout" });
      expect(error.failures).toMatchObject([
        { relay: relay1, kind: "rejected", ok: { ok: false } },
      ]);

      error.failures[0]!.kind = "failed";
      error.failures[0]!.ok!.message[3] = "consumer change";

      error.failures.push({ relay: relay2, kind: "timeout" });
      expect(error.failures).toHaveLength(2);
      expect(source[0]!.ok!.message[3]).toBe("blocked");
    });
  });

  describe("settlement", () => {
    test("isolates acknowledgements between concurrent publications to different relays", async () => {
      const { server, rxNostr } = createPublicationScenario();
      const signed = event();
      const sendA = rxNostr.publish([relay1], signed);
      const sendB = rxNostr.publish([relay2], signed);
      const firstInspector = new SubscriptionInspector<OkPacket>();
      const secondInspector = new SubscriptionInspector<OkPacket>();

      sendA.subscribe(firstInspector);
      sendB.subscribe(secondInspector);
      let settledA = false;
      const allA = sendA.waitFor("all").then(() => (settledA = true));
      const allB = sendB.waitFor("all");
      const first = socket(server, relay1);
      const second = socket(server, relay2);

      first.open();
      second.open();
      await Promise.all([
        expect(first.inbox.waitNext()).resolves.toEqual(["EVENT", expect.any(Object)]),
        expect(second.inbox.waitNext()).resolves.toEqual(["EVENT", expect.any(Object)]),
      ]);

      second.message(["OK", "event", true, "saved on relay B"]);
      await expect(allB).resolves.toBeUndefined();
      await expect(secondInspector.waitNext().then((packet) => packet.from)).resolves.toEqual(
        relay2,
      );
      expect(firstInspector.length).toBe(0);
      expect(settledA).toBe(false);

      first.message(["OK", "event", true, "saved on relay A"]);
      await expect(allA).resolves.toBe(true);
      await expect(firstInspector.waitNext()).resolves.toMatchObject({ from: relay1 });

      rxNostr.dispose();
    });

    test("publishes to multiple relays, settles all/any, and replays raw OK packets", async () => {
      const signed = event();
      const { server, rxNostr } = createPublicationScenario();
      const publication = rxNostr.publish([relay1, relay2], signed);

      const firstInspector = new SubscriptionInspector<OkPacket>();
      const firstObserver = publication.subscribe(firstInspector);
      const all = publication.waitFor("all");
      const any = publication.waitFor("any");
      let allSettled = false;

      void all.finally(() => (allSettled = true));

      const first = socket(server, relay1);
      const second = socket(server, relay2);

      first.open();
      second.open();
      await Promise.all([
        expect(first.inbox.waitNext()).resolves.toEqual(["EVENT", expect.any(Object)]),
        expect(second.inbox.waitNext()).resolves.toEqual(["EVENT", expect.any(Object)]),
      ]);
      first.message(["OK", "event", true, "saved first"]);

      await expect(any).resolves.toBeUndefined();
      expect(allSettled).toBe(false);
      await expect(firstInspector.waitNext()).resolves.toMatchObject({ from: relay1, ok: true });
      firstObserver.unsubscribe();
      second.message(["OK", "event", true, "saved second"]);
      await expect(all).resolves.toBeUndefined();

      const secondInspector = new SubscriptionInspector<OkPacket>();

      publication.subscribe(secondInspector);

      await expect(secondInspector.waitNext().then((packet) => packet.from)).resolves.toEqual(
        relay1,
      );
      await expect(secondInspector.waitNext().then((packet) => packet.from)).resolves.toEqual(
        relay2,
      );
      expect(secondInspector.completed).toBe(true);

      const snapshot = await publication.event;

      signed.content = "after";
      signed.tags[0]![1] = "after";

      expect(snapshot.content).toBe("before");
      expect(snapshot.tags).toEqual([["t", "before"]]);
      expect(Object.isFrozen(snapshot)).toBe(false);
      expect(Object.isFrozen(snapshot.tags)).toBe(false);
      expect(Object.isFrozen(snapshot.tags[0])).toBe(false);

      snapshot.content = "consumer change";
      snapshot.tags[0]![1] = "consumer change";

      expect(signed.content).toBe("after");
      expect(signed.tags[0]![1]).toBe("after");

      rxNostr.dispose();
    });

    test("rejects all on one final rejection while any can still succeed", async () => {
      const { server, rxNostr } = createPublicationScenario();
      const publication = rxNostr.publish([relay1, relay2], event());
      const allFailure = expect(publication.waitFor("all")).rejects.toMatchObject({
        code: "not-all-accepted",
        failures: [{ relay: relay1, kind: "rejected" }],
      });
      const any = publication.waitFor("any");
      const first = socket(server, relay1);
      const second = socket(server, relay2);

      first.open();
      second.open();
      await Promise.all([
        expect(first.inbox.waitNext()).resolves.toEqual(["EVENT", expect.any(Object)]),
        expect(second.inbox.waitNext()).resolves.toEqual(["EVENT", expect.any(Object)]),
      ]);

      first.message(["OK", "event", false, "blocked: denied"]);

      await allFailure;
      expect(second.isCloseRequested).toBe(false);

      second.message(["OK", "event", true, "saved"]);

      await expect(any).resolves.toBeUndefined();

      rxNostr.dispose();
    });

    test("isolates a timeout from another relay's acceptance", async () => {
      const { server, rxNostr } = createPublicationScenario();
      const publication = rxNostr.publish([relay1, relay2], event(), {
        timeout: 100,
      });
      const allFailure = expect(publication.waitFor("all")).rejects.toMatchObject({
        code: "not-all-accepted",
        failures: [{ relay: relay2, kind: "timeout" }],
      });
      const any = publication.waitFor("any");
      const first = socket(server, relay1);
      const second = socket(server, relay2);

      first.open();
      second.open();
      await Promise.all([
        expect(first.inbox.waitNext()).resolves.toEqual(["EVENT", expect.any(Object)]),
        expect(second.inbox.waitNext()).resolves.toEqual(["EVENT", expect.any(Object)]),
      ]);
      first.message(["OK", "event", true, "saved"]);

      await expect(any).resolves.toBeUndefined();
      await allFailure;

      rxNostr.dispose();
    });

    test("rejects a publication without relays before invoking its signer", async () => {
      const signEvent = vi.fn();
      const unusedSigner: EventSigner = {
        async signEvent<K extends number>(): Promise<Nostr.Event<K>> {
          signEvent();
          throw new Error("must not sign");
        },
        getPublicKey: async () => "unused",
      };
      const { server, rxNostr } = createPublicationScenario();
      const empty = rxNostr.publish([], event(), { signer: unusedSigner });

      await expect(empty.event).rejects.toMatchObject({ code: "no-relays" });
      await expect(empty.waitFor("all")).rejects.toMatchObject({
        code: "no-relays",
      });
      expect(signEvent).not.toHaveBeenCalled();
      expect(server.connections).toHaveLength(0);

      rxNostr.dispose();
    });

    test("wraps signer exceptions as typed callback errors", async () => {
      const cause = new Error("sign failed");
      const rejectingSigner: EventSigner = {
        async signEvent<K extends number>(): Promise<Nostr.Event<K>> {
          throw cause;
        },
        getPublicKey: async () => "unused",
      };
      const { rxNostr } = createPublicationScenario();
      const failed = rxNostr.publish(relay1, event(), { signer: rejectingSigner });
      const inspector = new SubscriptionInspector<unknown>();

      failed.subscribe(inspector);

      await expect(failed.event).rejects.toMatchObject({
        callback: "signer",
        cause,
      });
      await expect(failed.waitFor("any")).rejects.toBeInstanceOf(RxNostrCallbackError);
      await expect(inspector.waitError()).resolves.toEqual(
        expect.objectContaining({ callback: "signer", cause }),
      );

      rxNostr.dispose();
    });

    test("rejects an invalid event returned by a signer", async () => {
      const invalidSigner: EventSigner = {
        async signEvent<K extends number>(): Promise<Nostr.Event<K>> {
          return {} as Nostr.Event<K>;
        },
        getPublicKey: async () => "unused",
      };
      const { rxNostr } = createPublicationScenario();
      const invalid = rxNostr.publish(relay2, event(), { signer: invalidSigner });

      await expect(invalid.event).rejects.toMatchObject({ callback: "signer" });

      rxNostr.dispose();
    });
  });

  describe("cancellation and subscriptions", () => {
    scenarioTest(
      "cancels synchronously from an OK observer without settling twice",
      async ({ createScenario }) => {
        const { server, rxNostr } = createScenario({
          signer: new NoopSigner(),
          defaultOptions: { publish: { timeout: 1_000, linger: 0 } },
        });
        const publication = rxNostr.publish([relay1, relay2], event());
        const first = socket(server, relay1);
        const second = socket(server, relay2);
        const seen: OkPacket[] = [];

        publication.subscribe((packet) => {
          seen.push(packet);
          publication.cancel();
          publication.cancel();
        });
        const all = expect(publication.waitFor("all")).rejects.toMatchObject({ code: "cancelled" });
        const any = expect(publication.waitFor("any")).rejects.toMatchObject({ code: "cancelled" });

        first.open();
        second.open();
        await Promise.all([first.inbox.waitNext("EVENT"), second.inbox.waitNext("EVENT")]);
        first.message(["OK", "event", true, "saved"]);

        await Promise.all([all, any]);
        expect(seen).toHaveLength(1);
        expect(second.isCloseRequested).toBe(true);

        second.message(["OK", "event", true, "late"]);
        await settleProtocol();
        expect(seen).toHaveLength(1);
        await expect(publication.waitFor("any")).rejects.toMatchObject({ code: "cancelled" });
      },
    );

    scenarioTest(
      "disposes the root synchronously from an OK observer",
      async ({ createScenario }) => {
        const { server, rxNostr } = createScenario({
          signer: new NoopSigner(),
          defaultOptions: { publish: { timeout: 1_000, linger: 0 } },
        });
        const publication = rxNostr.publish([relay1, relay2], event());
        const first = socket(server, relay1);
        const second = socket(server, relay2);
        const inspector = new SubscriptionInspector<OkPacket>();

        publication.subscribe(() => rxNostr.dispose());
        publication.subscribe(inspector);
        const all = expect(publication.waitFor("all")).rejects.toMatchObject({ code: "cancelled" });

        first.open();
        second.open();
        await Promise.all([first.inbox.waitNext("EVENT"), second.inbox.waitNext("EVENT")]);
        first.message(["OK", "event", true, "saved"]);

        await all;
        expect(inspector.completed).toBe(true);
        expect(second.isCloseRequested).toBe(true);
      },
    );

    scenarioTest(
      "starts another publication and registers waitFor inside an OK observer",
      async ({ createScenario }) => {
        const { server, rxNostr } = createScenario({
          signer: new NoopSigner(),
          defaultOptions: { publish: { timeout: 1_000, linger: 0 } },
        });
        const firstPublication = rxNostr.publish(relay1, event({ id: "first" }));
        const firstAll = firstPublication.waitFor("all");
        const connection = socket(server, relay1);
        let secondPublication: Publication | undefined;
        let secondAll: Promise<void> | undefined;
        let reenteredAny: Promise<void> | undefined;

        firstPublication.subscribe(() => {
          reenteredAny = firstPublication.waitFor("any");
          secondPublication = rxNostr.publish(relay1, event({ id: "second" }));
          secondAll = secondPublication.waitFor("all");
        });

        connection.open();
        await expect(connection.inbox.waitNext("EVENT")).resolves.toMatchObject([
          "EVENT",
          { id: "first" },
        ]);
        connection.message(["OK", "first", true, "saved"]);

        await Promise.all([firstAll, reenteredAny]);
        expect(secondPublication).toBeDefined();
        await expect(connection.inbox.waitNext("EVENT")).resolves.toMatchObject([
          "EVENT",
          { id: "second" },
        ]);
        connection.message(["OK", "second", true, "saved"]);
        await expect(secondAll).resolves.toBeUndefined();
      },
    );

    scenarioTest.for(["before", "after"] as const)(
      "settles the timeout/OK boundary when OK arrives %s the deadline",
      async (order, { createScenario }) => {
        const { server, rxNostr } = createScenario({
          signer: new NoopSigner(),
          defaultOptions: { publish: { timeout: 100, linger: 0 } },
        });
        const publication = rxNostr.publish(relay1, event());
        const outcome = publication.waitFor("all").then(
          () => "accepted",
          (error: unknown) => error,
        );
        const connection = socket(server, relay1);

        connection.open();
        await connection.inbox.waitNext("EVENT");
        await vi.advanceTimersByTimeAsync(99);

        if (order === "before") {
          connection.message(["OK", "event", true, "saved"]);
          await vi.advanceTimersByTimeAsync(1);
          expect(await outcome).toBe("accepted");
        } else {
          await vi.advanceTimersByTimeAsync(1);
          connection.message(["OK", "event", true, "late"]);
          expect(await outcome).toMatchObject({
            code: "not-all-accepted",
            failures: [{ kind: "timeout" }],
          });
        }

        await settleProtocol();
        expect(server.connections).toHaveLength(1);
      },
    );

    test("rejects invalid timeout before signer or connection work", () => {
      const { server, rxNostr } = createPublicationScenario();
      const signEvent = vi.fn();
      const signer: EventSigner = {
        signEvent,
        getPublicKey: async () => "unused",
      };

      expect(() => rxNostr.publish(relay1, event(), { signer, timeout: NaN })).toThrow(RangeError);
      expect(signEvent).not.toHaveBeenCalled();
      expect(server.connections).toHaveLength(0);
      rxNostr.dispose();
    });

    test("cancel is idempotent and prevents sending after signing completes", async () => {
      const signing = createDeferred<Nostr.Event>();
      const signer: EventSigner = {
        signEvent: <K extends number>() => signing.promise as Promise<Nostr.Event<K>>,
        getPublicKey: async () => "pubkey",
      };
      const { server, rxNostr } = createPublicationScenario();
      const publication = rxNostr.publish(relay1, event(), { signer });
      const inspector = new SubscriptionInspector<unknown>();

      publication.subscribe(inspector);
      const all = publication.waitFor("all");

      publication.cancel();
      publication.cancel();

      await expect(all).rejects.toMatchObject({ code: "cancelled" });
      expect(inspector.completed).toBe(true);

      signing.resolve(event({ id: "cancelled-event" }));

      await expect(publication.event).resolves.toMatchObject({
        id: "cancelled-event",
      });
      await Promise.resolve();
      const socket = server.sockets.latest;

      expect(socket.inbox.length).toBe(0);

      rxNostr.dispose();
    });

    test("observer unsubscribe before signing does not cancel the publication", async () => {
      const signing = createDeferred<Nostr.Event>();
      const signer: EventSigner = {
        signEvent: <K extends number>() => signing.promise as Promise<Nostr.Event<K>>,
        getPublicKey: async () => "pubkey",
      };
      const { server, rxNostr } = createPublicationScenario();
      const publication = rxNostr.publish(relay1, event(), { signer });
      const observed = new SubscriptionInspector<OkPacket>();

      publication.subscribe(observed).unsubscribe();
      const all = publication.waitFor("all");

      signing.resolve(event());
      await publication.event;

      const connection = socket(server, relay1);

      connection.open();
      await expect(connection.inbox.waitNext()).resolves.toEqual(["EVENT", expect.any(Object)]);
      connection.message(["OK", "event", true, "saved"]);

      await expect(all).resolves.toBeUndefined();
      expect(observed.length).toBe(0);

      rxNostr.dispose();
    });
  });

  describe("relay failures and reconnection", () => {
    test("continues another relay after one connection drops", async () => {
      const { server, rxNostr } = createPublicationScenario();
      const publication = rxNostr.publish([relay1, relay2], event());
      const allFailure = expect(publication.waitFor("all")).rejects.toMatchObject({
        code: "not-all-accepted",
        failures: [
          {
            relay: relay2,
            kind: expect.stringMatching(/^(dropped|retry-exhausted)$/),
          },
        ],
      });
      const any = publication.waitFor("any");
      const first = socket(server, relay1);
      const second = socket(server, relay2);

      first.open();
      second.open();
      await Promise.all([
        expect(first.inbox.waitNext()).resolves.toEqual(["EVENT", expect.any(Object)]),
        expect(second.inbox.waitNext()).resolves.toEqual(["EVENT", expect.any(Object)]),
      ]);
      second.peerClose(1006, "offline");
      first.message(["OK", "event", true, "saved"]);

      await expect(any).resolves.toBeUndefined();
      await allFailure;

      rxNostr.dispose();
    });

    test("resends an unconfirmed EVENT after reconnect", async () => {
      const { server, rxNostr } = createPublicationScenario({
        reconnector: { reconnect: () => ({ action: "retry", delay: 0 }) },
      });
      const publication = rxNostr.publish(relay1, event());
      const all = publication.waitFor("all");
      const first = socket(server, relay1);

      first.open();
      await expect(first.inbox.waitNext()).resolves.toEqual(["EVENT", expect.any(Object)]);
      first.peerClose(1006, "offline");
      await expect(server.connections.wait(1)).resolves.toBeDefined();

      const second = server.sockets.latest;

      second.open();
      await expect(second.inbox.waitNext()).resolves.toEqual(["EVENT", expect.any(Object)]);
      second.message(["OK", "event", true, "saved"]);

      await expect(all).resolves.toBeUndefined();

      rxNostr.dispose();
    });
  });

  describe("authentication and resend", () => {
    test.each(["before", "after"] as const)(
      "keeps auth-required OK pending and settles when AUTH succeeds %s the refusal (#205)",
      async (authSuccess) => {
        const authEvent = Faker.authEvent({ id: "auth-event" });
        const { server, rxNostr } = createPublicationScenario({
          authenticator: {
            authTimeout: 1_000,
            challenge: async () => authEvent,
          },
        });
        const publication = rxNostr.publish(relay1, event());
        const inspector = new SubscriptionInspector<OkPacket>();

        publication.subscribe(inspector);
        const all = publication.waitFor("all");
        let settled = false;

        void all.finally(() => (settled = true));
        const connection = socket(server, relay1);

        connection.open();
        await expect(connection.inbox.waitNext()).resolves.toEqual(["EVENT", expect.any(Object)]);
        connection.message(["AUTH", "challenge"]);

        if (authSuccess === "before") {
          expect(await connection.inbox.waitNext("AUTH")).toEqual(["AUTH", authEvent]);
          connection.message(["OK", "auth-event", true, "authenticated"]);
          // Let AUTH's promise chain finish before delivering the delayed EVENT refusal.
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          expect(connection.inbox.length).toBe(2);
        }

        connection.message(["OK", "event", false, "auth-required: login"]);

        if (authSuccess === "after") {
          expect(await connection.inbox.waitNext("AUTH")).toEqual(["AUTH", authEvent]);
        }

        expect(settled).toBe(false);
        await expect(inspector.waitNext()).resolves.toMatchObject({ ok: false });

        if (authSuccess === "after") {
          connection.message(["OK", "auth-event", true, "authenticated"]);
        }

        await expect(connection.inbox.waitNext()).resolves.toHaveProperty("0", "EVENT");
        expect(connection.inbox.length).toBe(3);
        connection.message(["OK", "event", true, "saved"]);
        await expect(all).resolves.toBeUndefined();
        await expect(inspector.waitNext()).resolves.toMatchObject({ ok: true });
        await expect(inspector.waitComplete()).resolves.toBeUndefined();

        rxNostr.dispose();
      },
    );

    test("resends a later auth-required EVENT after another publication authenticated", async () => {
      const authEvent = Faker.authEvent({ id: "auth-event" });
      const { server, rxNostr } = createPublicationScenario({
        defaultOptions: { publish: { linger: 0, timeout: 5_000 } },
        authenticator: {
          authTimeout: 1_000,
          challenge: async () => authEvent,
        },
      });
      const firstPublication = rxNostr.publish(relay1, event({ id: "event-first" }));
      const laterPublication = rxNostr.publish(relay1, event({ id: "event-later" }));
      const firstAll = firstPublication.waitFor("all");
      const laterAll = laterPublication.waitFor("all");
      const connection = socket(server, relay1);

      connection.open();
      await expect(connection.inbox.waitNext()).resolves.toMatchObject([
        "EVENT",
        { id: "event-first" },
      ]);
      await expect(connection.inbox.waitNext()).resolves.toMatchObject([
        "EVENT",
        { id: "event-later" },
      ]);
      connection.message(["AUTH", "challenge"]);
      connection.message(["OK", "event-first", false, "auth-required: login"]);
      await expect(connection.inbox.waitNext()).resolves.toEqual(["AUTH", authEvent]);
      connection.message(["OK", "auth-event", true, "authenticated"]);
      await expect(connection.inbox.waitNext()).resolves.toMatchObject([
        "EVENT",
        { id: "event-first" },
      ]);

      connection.message(["OK", "event-later", false, "auth-required: login"]);
      await expect(connection.inbox.waitNext()).resolves.toMatchObject([
        "EVENT",
        { id: "event-later" },
      ]);
      expect(connection.inbox.length).toBe(5);

      connection.message(["OK", "event-first", true, "saved after authentication"]);
      connection.message(["OK", "event-later", true, "saved after authentication"]);
      await Promise.all([
        expect(firstAll).resolves.toBeUndefined(),
        expect(laterAll).resolves.toBeUndefined(),
      ]);

      rxNostr.dispose();
    });
  });
});
