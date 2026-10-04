import { tap } from "rxjs";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ControlledWebSocketServer, expectSent, Faker } from "../../../../__test__/helper/index.ts";
import { SubscriptionInspector } from "../../../../__test__/helper/subscription-inspector.ts";
import type { AuthenticatorInput } from "../../../../authenticator/index.ts";
import type { ConnectionState } from "../../../../connection-state.ts";
import type { OkPacket } from "../../../../packets/packets.interface.ts";
import { NostrTransport } from "../../transport/index.ts";
import { NostrOperationExecutor } from "../nostr-operation-executor.ts";
import { AuthCoordinator } from "./auth-coordinator.ts";

const relay = "wss://relay.example.com";
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});
async function setup(authenticator?: AuthenticatorInput) {
  const server = new ControlledWebSocketServer();
  const transport = new NostrTransport({
    url: relay,
    WebSocket: server.WebSocket,
    reconnector: { reconnect: () => ({ action: "retry", delay: 0 }) },
  });
  const executor = new NostrOperationExecutor(relay, transport, { authenticator });
  const opened = executor.open();
  const socket = server.sockets.latest;
  socket.open();
  await opened;
  cleanups.push(() => {
    executor.dispose();
    const socket = server.sockets.latest;
    socket.acknowledgeClose();
  });
  return { server, transport, executor };
}
const signed = (value: string) => Faker.authEvent({ id: `auth-${value}`, relay, challenge: value });
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

describe("connection AUTH lifecycle", () => {
  test("authenticates proactively, shares duplicate challenges and holds ordinary sends", async () => {
    const challenge = vi.fn(async (_relay, value) => signed(value));
    const { server, executor } = await setup({ challenge });
    const socket = server.sockets.latest;
    socket.message(["AUTH", "one"]);
    socket.message(["AUTH", "one"]);
    const event = Faker.event({ id: "event" });
    const inspector = new SubscriptionInspector<OkPacket>();

    executor.event(event).subscribe(inspector);
    await expectSent(socket, "AUTH");
    expect(socket.sentOfType("EVENT")).toHaveLength(0);
    expect(challenge).toHaveBeenCalledOnce();
    socket.message(["OK", "auth-one", true, ""]);
    await expectSent(socket, "EVENT");
    // Authentication has already completed when the refusal arrives.
    socket.message(["OK", "event", false, "auth-required: login"]);
    await expectSent(socket, "EVENT", 2);
    socket.message(["OK", "event", false, "auth-required: again"]);
    await vi.waitFor(() => expect(inspector.completed).toBe(true));
    expect(challenge).toHaveBeenCalledOnce();
  });

  test("retains failure, releases unrelated sends and permits a new generation", async () => {
    const challenge = vi.fn(async (_relay, value) => signed(value));
    const { server, executor } = await setup({ challenge });
    const socket = server.sockets.latest;
    socket.message(["AUTH", "one"]);
    const inspector = new SubscriptionInspector<OkPacket>();

    executor.event(Faker.event({ id: "event" })).subscribe(inspector);
    await expectSent(socket, "AUTH");
    socket.message(["OK", "auth-one", false, "denied"]);
    await expectSent(socket, "EVENT");
    socket.message(["OK", "event", false, "auth-required: login"]);
    await vi.waitFor(() => expect(inspector.completed).toBe(true));
    expect(challenge).toHaveBeenCalledOnce();
    socket.message(["AUTH", "two"]);
    await expectSent(socket, "AUTH", 2);
    expect(challenge).toHaveBeenCalledTimes(2);
  });

  test("old OK cannot release sends waiting on the replacement generation", async () => {
    const { server, executor } = await setup({ challenge: async (_relay, value) => signed(value) });
    const socket = server.sockets.latest;
    socket.message(["AUTH", "one"]);
    await expectSent(socket, "AUTH");
    const inspector = new SubscriptionInspector<OkPacket>();
    executor.event(Faker.event({ id: "event" })).subscribe(inspector);
    socket.message(["AUTH", "two"]);
    await expectSent(socket, "AUTH", 2);
    socket.message(["OK", "auth-one", true, ""]);
    await flush();
    expect(socket.sentOfType("EVENT")).toHaveLength(0);
    socket.message(["OK", "auth-two", true, ""]);
    await expectSent(socket, "EVENT");
  });

  test("operation cancellation does not abandon connection AUTH or allow a second attempt", async () => {
    let resolve!: (event: ReturnType<typeof signed>) => void;
    const challenge = vi.fn(
      () =>
        new Promise<ReturnType<typeof signed>>((r) => {
          resolve = r;
        }),
    );
    const { server, executor } = await setup({ challenge });
    const firstInspector = new SubscriptionInspector<OkPacket>();
    executor
      .event(Faker.event({ id: "event" }))
      .subscribe(firstInspector)
      .unsubscribe();
    const socket = server.sockets.latest;
    socket.message(["AUTH", "one"]);
    const secondInspector = new SubscriptionInspector<OkPacket>();
    const subscription = executor
      .event(Faker.event({ id: "cancelled" }))
      .subscribe(secondInspector);
    await vi.waitFor(() => expect(challenge).toHaveBeenCalledOnce());
    subscription.unsubscribe();
    resolve(signed("one"));
    await expectSent(socket, "AUTH");
    socket.message(["OK", "auth-one", true, ""]);
    await flush();
    expect(socket.sentOfType("EVENT")).toHaveLength(0);
    socket.message(["AUTH", "one"]);
    await flush();
    expect(challenge).toHaveBeenCalledOnce();
  });

  test("a cancelled auth-required operation is not retransmitted", async () => {
    const { server, executor } = await setup({ challenge: async (_relay, value) => signed(value) });
    const inspector = new SubscriptionInspector<OkPacket>();
    const subscription = executor.event(Faker.event({ id: "event" })).subscribe(inspector);
    const socket = server.sockets.latest;
    await expectSent(socket, "EVENT");
    socket.message(["AUTH", "one"]);
    socket.message(["OK", "event", false, "auth-required: login"]);
    await expectSent(socket, "AUTH");
    subscription.unsubscribe();
    socket.message(["OK", "auth-one", true, ""]);
    await flush();
    expect(socket.sentOfType("EVENT")).toHaveLength(1);
  });

  test("reconnect retransmission waits on the new connection challenge", async () => {
    const { server, executor, transport } = await setup({
      challenge: async (_relay, value) => signed(value),
    });
    const inspector = new SubscriptionInspector<OkPacket>();
    executor.event(Faker.event({ id: "event" })).subscribe(inspector);
    const oldSocket = server.sockets.latest;
    await expectSent(oldSocket, "EVENT");
    oldSocket.message(["AUTH", "old"]);
    await expectSent(oldSocket, "AUTH");
    oldSocket.peerClose(1006, "offline");
    await vi.waitFor(() => expect(server.connections).toHaveLength(2));
    const socket = server.sockets.latest;
    const connectionInspector = new SubscriptionInspector<ConnectionState>();
    const notify = transport.state$
      .pipe(
        tap((state) => {
          if (state.state === "connected") socket.message(["AUTH", "new"]);
        }),
      )
      .subscribe(connectionInspector);
    socket.open();
    await expectSent(socket, "AUTH");
    notify.unsubscribe();
    await flush();
    expect(socket.sentOfType("EVENT")).toHaveLength(0);
    oldSocket.message(["OK", "auth-old", true, ""]);
    await flush();
    expect(socket.sentOfType("EVENT")).toHaveLength(0);
    socket.message(["OK", "auth-new", true, ""]);
    await expectSent(socket, "EVENT");
  });

  test("several EVENT operations join pending AUTH and each retransmit once", async () => {
    const challenge = vi.fn(async (_relay, value) => signed(value));
    const { server, executor } = await setup({ challenge });
    const inspectors = [new SubscriptionInspector<unknown>(), new SubscriptionInspector<unknown>()];
    executor.event(Faker.event({ id: "first" })).subscribe(inspectors[0]);
    executor.event(Faker.event({ id: "second" })).subscribe(inspectors[1]);
    const socket = server.sockets.latest;
    await expectSent(socket, "EVENT", 2);
    socket.message(["AUTH", "one"]);
    for (const id of ["first", "second"]) socket.message(["OK", id, false, "auth-required: login"]);
    await expectSent(socket, "AUTH");
    expect(socket.sentOfType("EVENT")).toHaveLength(2);
    socket.message(["OK", "auth-one", true, ""]);
    await expectSent(socket, "EVENT", 4);
    for (const id of ["first", "second"]) socket.message(["OK", id, true, "saved"]);
    await Promise.all(
      inspectors.map((inspector) => expect(inspector.waitComplete()).resolves.toBeUndefined()),
    );
    expect(challenge).toHaveBeenCalledOnce();
  });

  test("relay factory failure is cached and does not block ordinary sends", async () => {
    const cause = new Error("wallet unavailable");
    const factory = vi.fn(() => {
      throw cause;
    });
    const { server, executor } = await setup(factory);
    const socket = server.sockets.latest;
    socket.message(["AUTH", "one"]);
    const inspector = new SubscriptionInspector<OkPacket>();

    executor.event(Faker.event({ id: "event" })).subscribe(inspector);
    await expectSent(socket, "EVENT");
    socket.message(["OK", "event", false, "auth-required: login"]);
    expect(await inspector.waitError()).toMatchObject({
      name: "RxNostrCallbackError",
      callback: "authenticator",
      cause,
    });
    expect(factory).toHaveBeenCalledOnce();
  });

  test("CLOSE bypasses pending AUTH", async () => {
    const { server, executor, transport } = await setup({ challenge: () => new Promise(() => {}) });
    const socket = server.sockets.latest;
    socket.message(["AUTH", "one"]);
    await transport.cast(["CLOSE", "subscription"]);
    expect(await expectSent(socket, "CLOSE")).toEqual(["CLOSE", "subscription"]);
    executor.dispose();
  });

  test("disabled authentication retains challenge without starting an attempt", async () => {
    const { server, transport } = await setup();
    const auth = new AuthCoordinator(relay, transport);
    const socket = server.sockets.latest;
    socket.message(["AUTH", "one"]);
    await expect(auth.authenticate()).rejects.toMatchObject({ reason: "disabled" });
    expect(socket.sentOfType("AUTH")).toHaveLength(0);
    auth.dispose();
  });
});
