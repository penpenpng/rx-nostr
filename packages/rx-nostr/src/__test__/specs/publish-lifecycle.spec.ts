import type * as Nostr from "nostr-typedef";
import { describe, expect, test, vi } from "vitest";
import { type EventSigner, type OkPacket } from "rx-nostr";
import {
  createDeferred,
  createPublicationScenario,
  expectConnectionCount,
  expectPublicationSent as expectEventSent,
  expectSent,
  expectSocketCloseRequested,
  Faker,
  publicationEvent as event,
  publicationRelay1 as relay1,
  publicationRelay2 as relay2,
  publicationSocket as socket,
} from "../helper/index.ts";

describe("Publication lifecycle", () => {
  describe("cancellation and connection ownership", () => {
    test("cancel is idempotent and prevents sending after signing completes", async () => {
      const signing = createDeferred<Nostr.Event>();
      const signer: EventSigner = {
        signEvent: <K extends number>() => signing.promise as Promise<Nostr.Event<K>>,
        getPublicKey: async () => "pubkey",
      };
      const { server, rxNostr } = createPublicationScenario();
      const publication = rxNostr.publish(relay1, event(), { signer });
      const complete = vi.fn();

      publication.subscribe({ complete });
      const all = publication.waitFor("all");

      publication.cancel();
      publication.cancel();

      await expect(all).rejects.toMatchObject({ code: "cancelled" });
      expect(complete).toHaveBeenCalledOnce();

      signing.resolve(event({ id: "cancelled-event" }));

      await expect(publication.event).resolves.toMatchObject({
        id: "cancelled-event",
      });
      await Promise.resolve();
      expect(server.sockets.latest.sent).toHaveLength(0);

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
      const observed = vi.fn();

      publication.subscribe(observed).unsubscribe();
      const all = publication.waitFor("all");

      signing.resolve(event());
      await publication.event;

      const connection = socket(server, relay1);
      connection.open();
      await expectEventSent(connection);
      connection.message(["OK", "event", true, "saved"]);

      await expect(all).resolves.toBeUndefined();
      expect(observed).not.toHaveBeenCalled();

      rxNostr.dispose();
    });

    test("keeps a hot relay connected while releasing a cold publish relay", async () => {
      const { server, rxNostr } = createPublicationScenario();
      rxNostr.setHotRelays([relay1]);
      const hot = socket(server, relay1);

      hot.open();

      const publication = rxNostr.publish([relay1, relay2], event());
      const cold = socket(server, relay2);

      cold.open();
      await Promise.all([expectEventSent(hot), expectEventSent(cold)]);
      hot.message(["OK", "event", true, "saved"]);
      cold.message(["OK", "event", true, "saved"]);
      await expect(publication.waitFor("all")).resolves.toBeUndefined();

      await expectSocketCloseRequested(cold);
      expect(hot.closeRequests).toHaveLength(0);

      rxNostr.unsetHotRelays();
      await expectSocketCloseRequested(hot);

      cold.acknowledgeClose();
      hot.acknowledgeClose();
      rxNostr.dispose();
    });
  });

  describe("AUTH and reconnection", () => {
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
      await Promise.all([expectEventSent(first), expectEventSent(second)]);
      second.peerClose(1006, "offline");
      first.message(["OK", "event", true, "saved"]);

      await expect(any).resolves.toBeUndefined();
      await allFailure;

      rxNostr.dispose();
    });

    test("keeps auth-required OK pending and settles after authenticated resend", async () => {
      const authEvent = Faker.authEvent({ id: "auth-event" });
      const { server, rxNostr } = createPublicationScenario({
        authenticator: {
          authTimeout: 1_000,
          challenge: async () => authEvent,
        },
      });
      const publication = rxNostr.publish(relay1, event());
      const packets: OkPacket[] = [];

      publication.subscribe((packet) => packets.push(packet));
      const all = publication.waitFor("all");
      let settled = false;
      void all.finally(() => (settled = true));
      const connection = socket(server, relay1);

      connection.open();
      await expectEventSent(connection);
      connection.message(["AUTH", "challenge"]);
      connection.message(["OK", "event", false, "auth-required: login"]);
      expect(await expectSent(connection, "AUTH")).toEqual(["AUTH", authEvent]);
      expect(settled).toBe(false);
      expect(packets).toHaveLength(1);

      connection.message(["OK", "auth-event", true, "authenticated"]);
      await expectSent(connection, "EVENT", 2);
      connection.message(["OK", "event", true, "saved"]);
      await expect(all).resolves.toBeUndefined();
      expect(packets.map((packet) => packet.ok)).toEqual([false, true]);

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
      await expectEventSent(first);
      first.peerClose(1006, "offline");
      await expectConnectionCount(server, 2);

      const second = server.sockets.latest;
      second.open();
      await expectEventSent(second);
      second.message(["OK", "event", true, "saved"]);

      await expect(all).resolves.toBeUndefined();

      rxNostr.dispose();
    });
  });
});
