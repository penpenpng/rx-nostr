import type * as Nostr from "nostr-typedef";
import {
  RxNostrCallbackError,
  RxNostrPublicationError,
  type EventSigner,
  type OkPacket,
  type Publication,
  type PublicationFailure,
} from "rx-nostr";
import { describe, expect, expectTypeOf, test, vi } from "vitest";

import {
  createPublicationScenario,
  publicationEvent as event,
  publicationRelay1 as relay1,
  publicationRelay2 as relay2,
  publicationSocket as socket,
} from "../helper/index.ts";
import { SubscriptionInspector } from "../helper/subscription-inspector.ts";

describe("Publication public contract", () => {
  describe("public values", () => {
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
});
