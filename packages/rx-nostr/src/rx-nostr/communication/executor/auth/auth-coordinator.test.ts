import { afterEach, describe, expect, test, vi } from "vitest";
import { ControlledWebSocketServer, expectSent, Faker } from "../../../../__test__/helper/index.ts";
import type { AuthenticatorInput } from "../../../../authenticator/index.ts";
import { AuthCoordinator } from "./auth-coordinator.ts";
import { NostrOperationExecutor } from "../nostr-operation-executor.ts";
import { NostrTransport } from "../../transport/index.ts";

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
  server.sockets.latest.open();
  await opened;
  cleanups.push(() => {
    executor.dispose();
    server.sockets.latest.acknowledgeClose();
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
    server.sockets.latest.message(["AUTH", "one"]);
    server.sockets.latest.message(["AUTH", "one"]);
    const event = Faker.event({ id: "event" });
    const complete = vi.fn();
    executor.event(event).subscribe({ complete });
    await expectSent(server.sockets.latest, "AUTH");
    expect(server.sockets.latest.sentOfType("EVENT")).toHaveLength(0);
    expect(challenge).toHaveBeenCalledOnce();
    server.sockets.latest.message(["OK", "auth-one", true, ""]);
    await expectSent(server.sockets.latest, "EVENT");
    // Authentication has already completed when the refusal arrives.
    server.sockets.latest.message(["OK", "event", false, "auth-required: login"]);
    await expectSent(server.sockets.latest, "EVENT", 2);
    server.sockets.latest.message(["OK", "event", false, "auth-required: again"]);
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(challenge).toHaveBeenCalledOnce();
  });

  test("retains failure, releases unrelated sends and permits a new generation", async () => {
    const challenge = vi.fn(async (_relay, value) => signed(value));
    const { server, executor } = await setup({ challenge });
    server.sockets.latest.message(["AUTH", "one"]);
    const complete = vi.fn();
    executor.event(Faker.event({ id: "event" })).subscribe({ complete });
    await expectSent(server.sockets.latest, "AUTH");
    server.sockets.latest.message(["OK", "auth-one", false, "denied"]);
    await expectSent(server.sockets.latest, "EVENT");
    server.sockets.latest.message(["OK", "event", false, "auth-required: login"]);
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(challenge).toHaveBeenCalledOnce();
    server.sockets.latest.message(["AUTH", "two"]);
    await expectSent(server.sockets.latest, "AUTH", 2);
    expect(challenge).toHaveBeenCalledTimes(2);
  });

  test("old OK cannot release sends waiting on the replacement generation", async () => {
    const { server, executor } = await setup({ challenge: async (_relay, value) => signed(value) });
    server.sockets.latest.message(["AUTH", "one"]);
    await expectSent(server.sockets.latest, "AUTH");
    executor.event(Faker.event({ id: "event" })).subscribe();
    server.sockets.latest.message(["AUTH", "two"]);
    await expectSent(server.sockets.latest, "AUTH", 2);
    server.sockets.latest.message(["OK", "auth-one", true, ""]);
    await flush();
    expect(server.sockets.latest.sentOfType("EVENT")).toHaveLength(0);
    server.sockets.latest.message(["OK", "auth-two", true, ""]);
    await expectSent(server.sockets.latest, "EVENT");
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
    executor
      .event(Faker.event({ id: "event" }))
      .subscribe()
      .unsubscribe();
    server.sockets.latest.message(["AUTH", "one"]);
    const subscription = executor.event(Faker.event({ id: "cancelled" })).subscribe();
    await vi.waitFor(() => expect(challenge).toHaveBeenCalledOnce());
    subscription.unsubscribe();
    resolve(signed("one"));
    await expectSent(server.sockets.latest, "AUTH");
    server.sockets.latest.message(["OK", "auth-one", true, ""]);
    await flush();
    expect(server.sockets.latest.sentOfType("EVENT")).toHaveLength(0);
    server.sockets.latest.message(["AUTH", "one"]);
    await flush();
    expect(challenge).toHaveBeenCalledOnce();
  });

  test("a cancelled auth-required operation is not retransmitted", async () => {
    const { server, executor } = await setup({ challenge: async (_relay, value) => signed(value) });
    const subscription = executor.event(Faker.event({ id: "event" })).subscribe();
    await expectSent(server.sockets.latest, "EVENT");
    server.sockets.latest.message(["AUTH", "one"]);
    server.sockets.latest.message(["OK", "event", false, "auth-required: login"]);
    await expectSent(server.sockets.latest, "AUTH");
    subscription.unsubscribe();
    server.sockets.latest.message(["OK", "auth-one", true, ""]);
    await flush();
    expect(server.sockets.latest.sentOfType("EVENT")).toHaveLength(1);
  });

  test("reconnect retransmission waits on the new connection challenge", async () => {
    const { server, executor, transport } = await setup({
      challenge: async (_relay, value) => signed(value),
    });
    executor.event(Faker.event({ id: "event" })).subscribe();
    const oldSocket = server.sockets.latest;
    await expectSent(oldSocket, "EVENT");
    oldSocket.message(["AUTH", "old"]);
    await expectSent(oldSocket, "AUTH");
    oldSocket.peerClose(1006, "offline");
    await vi.waitFor(() => expect(server.connections).toHaveLength(2));
    const socket = server.sockets.latest;
    const notify = transport.state$.subscribe((state) => {
      if (state.state === "connected") socket.message(["AUTH", "new"]);
    });
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
    const completed = [vi.fn(), vi.fn()];
    executor.event(Faker.event({ id: "first" })).subscribe({ complete: completed[0] });
    executor.event(Faker.event({ id: "second" })).subscribe({ complete: completed[1] });
    await expectSent(server.sockets.latest, "EVENT", 2);
    server.sockets.latest.message(["AUTH", "one"]);
    for (const id of ["first", "second"])
      server.sockets.latest.message(["OK", id, false, "auth-required: login"]);
    await expectSent(server.sockets.latest, "AUTH");
    expect(server.sockets.latest.sentOfType("EVENT")).toHaveLength(2);
    server.sockets.latest.message(["OK", "auth-one", true, ""]);
    await expectSent(server.sockets.latest, "EVENT", 4);
    for (const id of ["first", "second"]) server.sockets.latest.message(["OK", id, true, "saved"]);
    await vi.waitFor(() => {
      for (const complete of completed) expect(complete).toHaveBeenCalledOnce();
    });
    expect(challenge).toHaveBeenCalledOnce();
  });

  test("relay factory failure is cached and does not block ordinary sends", async () => {
    const cause = new Error("wallet unavailable");
    const factory = vi.fn(() => {
      throw cause;
    });
    const { server, executor } = await setup(factory);
    server.sockets.latest.message(["AUTH", "one"]);
    const errors = vi.fn();
    executor.event(Faker.event({ id: "event" })).subscribe({ error: errors });
    await expectSent(server.sockets.latest, "EVENT");
    server.sockets.latest.message(["OK", "event", false, "auth-required: login"]);
    await vi.waitFor(() => expect(errors).toHaveBeenCalledOnce());
    expect(errors.mock.calls[0]![0]).toMatchObject({
      name: "RxNostrCallbackError",
      callback: "authenticator",
      cause,
    });
    expect(factory).toHaveBeenCalledOnce();
  });

  test("CLOSE bypasses pending AUTH", async () => {
    const { server, executor, transport } = await setup({ challenge: () => new Promise(() => {}) });
    server.sockets.latest.message(["AUTH", "one"]);
    await transport.cast(["CLOSE", "subscription"]);
    expect(await expectSent(server.sockets.latest, "CLOSE")).toEqual(["CLOSE", "subscription"]);
    executor.dispose();
  });

  test("disabled authentication retains challenge without starting an attempt", async () => {
    const { server, transport } = await setup();
    const auth = new AuthCoordinator(relay, transport);
    server.sockets.latest.message(["AUTH", "one"]);
    await expect(auth.authenticate()).rejects.toMatchObject({ reason: "disabled" });
    expect(server.sockets.latest.sentOfType("AUTH")).toHaveLength(0);
    auth.dispose();
  });
});
