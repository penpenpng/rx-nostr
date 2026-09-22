import type * as Nostr from "nostr-typedef";
import { describe, expect, test, vi } from "vitest";
import {
  RxNostr,
  NoopRetryer,
  NoopSigner,
  NoopVerifier,
  RxNostrCallbackError,
  type EventSigner,
  type OkPacket,
} from "rx-nostr";
import { ControlledWebSocket, ControlledWebSocketServer } from "../support/controlled-websocket.ts";

const relay1 = "wss://relay1.example.com";
const relay2 = "wss://relay2.example.com";

function event(overrides: Partial<Nostr.Event> = {}): Nostr.Event {
  return {
    id: "event",
    pubkey: "pubkey",
    created_at: 1,
    kind: 1,
    tags: [["t", "before"]],
    content: "before",
    sig: "signature",
    ...overrides,
  };
}

function socket(server: ControlledWebSocketServer, url: string): ControlledWebSocket {
  return server.sockets.latestFor(url);
}

async function expectEventSent(connection: ControlledWebSocket): Promise<void> {
  await vi.waitFor(() => expect(connection.sent).toHaveLength(1));
  expect(JSON.parse(connection.sent[0] as string)[0]).toBe("EVENT");
}

describe("Publication public contract", () => {
  test("publishes to multiple relays, settles all/any, and replays raw OK packets", async () => {
    const server = new ControlledWebSocketServer();
    const signed = event();
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      retry: new NoopRetryer(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const publication = rxNostr.publish([relay1, relay2], signed, {
      signer: new NoopSigner(),
      linger: 0,
      timeout: 1_000,
    });
    const firstPackets: OkPacket[] = [];
    const firstObserver = publication.subscribe((packet) => firstPackets.push(packet));
    const all = publication.waitFor("all");
    const any = publication.waitFor("any");
    let allSettled = false;
    void all.finally(() => (allSettled = true));

    const first = socket(server, relay1);
    const second = socket(server, relay2);
    first.open();
    second.open();
    await Promise.all([expectEventSent(first), expectEventSent(second)]);
    first.message(JSON.stringify(["OK", "event", true, "saved first"]));

    await expect(any).resolves.toBeUndefined();
    expect(allSettled).toBe(false);
    expect(firstPackets).toHaveLength(1);
    firstObserver.unsubscribe();
    second.message(JSON.stringify(["OK", "event", true, "saved second"]));
    await expect(all).resolves.toBeUndefined();

    const replayed: OkPacket[] = [];
    const replayComplete = vi.fn();
    publication.subscribe({
      next: (packet) => replayed.push(packet),
      complete: replayComplete,
    });
    expect(replayed.map((packet) => packet.from)).toEqual([relay1, relay2]);
    expect(replayComplete).toHaveBeenCalledOnce();

    const snapshot = await publication.event;
    signed.content = "after";
    signed.tags[0]![1] = "after";
    expect(snapshot.content).toBe("before");
    expect(snapshot.tags).toEqual([["t", "before"]]);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.tags)).toBe(true);
    expect(Object.isFrozen(snapshot.tags[0])).toBe(true);
    rxNostr.dispose();
  });

  test("rejects all on one final rejection while any can still succeed", async () => {
    const server = new ControlledWebSocketServer();
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      retry: new NoopRetryer(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const publication = rxNostr.publish([relay1, relay2], event(), {
      signer: new NoopSigner(),
      linger: 0,
      timeout: 1_000,
    });
    const allFailure = expect(publication.waitFor("all")).rejects.toMatchObject({
      code: "not-all-accepted",
      failures: [{ relay: relay1, kind: "rejected" }],
    });
    const any = publication.waitFor("any");
    const first = socket(server, relay1);
    const second = socket(server, relay2);
    first.open();
    second.open();
    await Promise.all([expectEventSent(first), expectEventSent(second)]);

    first.message(JSON.stringify(["OK", "event", false, "blocked: denied"]));
    await allFailure;
    expect(second.closeRequests).toHaveLength(0);
    second.message(JSON.stringify(["OK", "event", true, "saved"]));
    await expect(any).resolves.toBeUndefined();
    rxNostr.dispose();
  });

  test("isolates a timeout from another relay's acceptance", async () => {
    const server = new ControlledWebSocketServer();
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      retry: new NoopRetryer(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const publication = rxNostr.publish([relay1, relay2], event(), {
      signer: new NoopSigner(),
      linger: 0,
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
    await Promise.all([expectEventSent(first), expectEventSent(second)]);
    first.message(JSON.stringify(["OK", "event", true, "saved"]));

    await expect(any).resolves.toBeUndefined();
    await allFailure;
    rxNostr.dispose();
  });

  test("rejects no-relay and signer failures with typed errors", async () => {
    const server = new ControlledWebSocketServer();
    const signEvent = vi.fn();
    const unusedSigner: EventSigner = {
      async signEvent<K extends number>(): Promise<Nostr.Event<K>> {
        signEvent();
        throw new Error("must not sign");
      },
      getPublicKey: async () => "unused",
    };
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const empty = rxNostr.publish([], event(), { signer: unusedSigner });
    await expect(empty.event).rejects.toMatchObject({ code: "no-relays" });
    await expect(empty.waitFor("all")).rejects.toMatchObject({
      code: "no-relays",
    });
    expect(signEvent).not.toHaveBeenCalled();
    expect(server.connections).toHaveLength(0);

    const cause = new Error("sign failed");
    const rejectingSigner: EventSigner = {
      async signEvent<K extends number>(): Promise<Nostr.Event<K>> {
        throw cause;
      },
      getPublicKey: async () => "unused",
    };
    const failed = rxNostr.publish(relay1, event(), { signer: rejectingSigner, linger: 0 });
    const observerError = vi.fn();
    failed.subscribe({ error: observerError });
    await expect(failed.event).rejects.toMatchObject({
      callback: "signer",
      cause,
    });
    await expect(failed.waitFor("any")).rejects.toBeInstanceOf(RxNostrCallbackError);
    expect(observerError).toHaveBeenCalledWith(
      expect.objectContaining({ callback: "signer", cause }),
    );

    const invalidSigner: EventSigner = {
      async signEvent<K extends number>(): Promise<Nostr.Event<K>> {
        return {} as Nostr.Event<K>;
      },
      getPublicKey: async () => "unused",
    };
    const invalid = rxNostr.publish(relay2, event(), { signer: invalidSigner, linger: 0 });
    await expect(invalid.event).rejects.toMatchObject({ callback: "signer" });
    rxNostr.dispose();
  });

  test("cancel is idempotent and prevents sending after signing completes", async () => {
    const server = new ControlledWebSocketServer();
    let resolveSigning!: (event: Nostr.Event) => void;
    const signing = new Promise<Nostr.Event>((resolve) => {
      resolveSigning = resolve;
    });
    const signer: EventSigner = {
      signEvent: <K extends number>() => signing as Promise<Nostr.Event<K>>,
      getPublicKey: async () => "pubkey",
    };
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const publication = rxNostr.publish(relay1, event(), { signer, linger: 0 });
    const complete = vi.fn();
    publication.subscribe({ complete });
    const all = publication.waitFor("all");

    publication.cancel();
    publication.cancel();
    await expect(all).rejects.toMatchObject({ code: "cancelled" });
    expect(complete).toHaveBeenCalledOnce();
    resolveSigning(event({ id: "cancelled-event" }));
    await expect(publication.event).resolves.toMatchObject({
      id: "cancelled-event",
    });
    await Promise.resolve();
    expect(server.sockets.latest.sent).toHaveLength(0);
    rxNostr.dispose();
  });

  test("observer unsubscribe before signing does not cancel the publication", async () => {
    const server = new ControlledWebSocketServer();
    let resolveSigning!: (event: Nostr.Event) => void;
    const signing = new Promise<Nostr.Event>((resolve) => {
      resolveSigning = resolve;
    });
    const signer: EventSigner = {
      signEvent: <K extends number>() => signing as Promise<Nostr.Event<K>>,
      getPublicKey: async () => "pubkey",
    };
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      retry: new NoopRetryer(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const publication = rxNostr.publish(relay1, event(), { signer, linger: 0, timeout: 1_000 });
    const observed = vi.fn();
    publication.subscribe(observed).unsubscribe();
    const all = publication.waitFor("all");
    resolveSigning(event());
    await publication.event;
    const connection = socket(server, relay1);
    connection.open();
    await expectEventSent(connection);
    connection.message(JSON.stringify(["OK", "event", true, "saved"]));

    await expect(all).resolves.toBeUndefined();
    expect(observed).not.toHaveBeenCalled();
    rxNostr.dispose();
  });

  test("keeps a hot relay connected while releasing a cold publish relay", async () => {
    const server = new ControlledWebSocketServer();
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      retry: new NoopRetryer(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    rxNostr.setHotRelays([relay1]);
    const hot = socket(server, relay1);
    hot.open();
    const publication = rxNostr.publish([relay1, relay2], event(), {
      signer: new NoopSigner(),
      linger: 0,
      timeout: 1_000,
    });
    const cold = socket(server, relay2);
    cold.open();
    await Promise.all([expectEventSent(hot), expectEventSent(cold)]);
    hot.message(JSON.stringify(["OK", "event", true, "saved"]));
    cold.message(JSON.stringify(["OK", "event", true, "saved"]));
    await expect(publication.waitFor("all")).resolves.toBeUndefined();

    await vi.waitFor(() => expect(cold.closeRequests).toHaveLength(1));
    expect(hot.closeRequests).toHaveLength(0);
    rxNostr.unsetHotRelays();
    await vi.waitFor(() => expect(hot.closeRequests).toHaveLength(1));
    cold.acknowledgeClose();
    hot.acknowledgeClose();
    rxNostr.dispose();
  });

  test("continues another relay after one connection drops", async () => {
    const server = new ControlledWebSocketServer();
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      retry: new NoopRetryer(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const publication = rxNostr.publish([relay1, relay2], event(), {
      signer: new NoopSigner(),
      linger: 0,
      timeout: 1_000,
    });
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
    first.message(JSON.stringify(["OK", "event", true, "saved"]));

    await expect(any).resolves.toBeUndefined();
    await allFailure;
    rxNostr.dispose();
  });

  test("keeps auth-required OK pending and settles after authenticated resend", async () => {
    const server = new ControlledWebSocketServer();
    const authEvent = event({ id: "auth-event", kind: 22242 });
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      authenticator: {
        authTimeout: 1_000,
        challenge: async () => ({ ...authEvent, kind: 22242 }),
      },
      retry: new NoopRetryer(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const publication = rxNostr.publish(relay1, event(), {
      signer: new NoopSigner(),
      linger: 0,
      timeout: 1_000,
    });
    const packets: OkPacket[] = [];
    publication.subscribe((packet) => packets.push(packet));
    const all = publication.waitFor("all");
    let settled = false;
    void all.finally(() => (settled = true));
    const connection = socket(server, relay1);
    connection.open();
    await expectEventSent(connection);
    connection.message(JSON.stringify(["AUTH", "challenge"]));
    connection.message(JSON.stringify(["OK", "event", false, "auth-required: login"]));
    await vi.waitFor(() => expect(connection.sent).toHaveLength(2));
    expect(settled).toBe(false);
    expect(packets).toHaveLength(1);

    connection.message(JSON.stringify(["OK", "auth-event", true, "authenticated"]));
    await vi.waitFor(() => expect(connection.sent).toHaveLength(3));
    connection.message(JSON.stringify(["OK", "event", true, "saved"]));
    await expect(all).resolves.toBeUndefined();
    expect(packets.map((packet) => packet.ok)).toEqual([false, true]);
    rxNostr.dispose();
  });

  test("resends an unconfirmed EVENT after reconnect", async () => {
    const server = new ControlledWebSocketServer();
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      retry: { retry: () => ({ action: "retry", delay: 0 }) },
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const publication = rxNostr.publish(relay1, event(), {
      signer: new NoopSigner(),
      linger: 0,
      timeout: 1_000,
    });
    const all = publication.waitFor("all");
    const first = socket(server, relay1);
    first.open();
    await expectEventSent(first);
    first.peerClose(1006, "offline");
    await vi.waitFor(() => expect(server.connections).toHaveLength(2));
    const second = server.sockets.latest;
    second.open();
    await expectEventSent(second);
    second.message(JSON.stringify(["OK", "event", true, "saved"]));

    await expect(all).resolves.toBeUndefined();
    rxNostr.dispose();
  });
});
