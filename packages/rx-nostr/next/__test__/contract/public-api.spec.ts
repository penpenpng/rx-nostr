import { describe, expect, expectTypeOf, test } from "vitest";
import * as publicApi from "rx-nostr";
import type {
  EventPacket,
  IRxNostr,
  OkPacket,
  Publication,
  RelayInput,
  RelayUrl,
} from "rx-nostr";

describe("public entry point", () => {
  test("can be imported by contract tests", () => {
    expect(publicApi).toBeTypeOf("object");
    expect(publicApi.createRxNostr).toBeTypeOf("function");
    expect(publicApi.RelayDirectory).toBeTypeOf("function");
    expect(publicApi.GlobalRelayDirectory).toBeInstanceOf(
      publicApi.RelayDirectory,
    );
    expect(publicApi).not.toHaveProperty("RxNostr");
    expect(publicApi).not.toHaveProperty("NostrTransport");
    expect(publicApi).not.toHaveProperty("Unipls");
  });

  test("exposes the v4 operation model", () => {
    expectTypeOf<IRxNostr["publish"]>().returns.toEqualTypeOf<Publication>();
    expectTypeOf<Publication["waitFor"]>().returns.toEqualTypeOf<
      Promise<void>
    >();
    expectTypeOf<string>().toMatchTypeOf<RelayInput>();
    expectTypeOf<string[]>().toMatchTypeOf<RelayInput>();
    expectTypeOf<"ws://relay.example">().toMatchTypeOf<RelayUrl>();
  });

  test("keeps physical query identifiers out of results", () => {
    expectTypeOf<EventPacket>().toHaveProperty("traceTag");
    expectTypeOf<EventPacket>().not.toHaveProperty("subId");
    expectTypeOf<EventPacket>().not.toHaveProperty("vreqId");
    expectTypeOf<EventPacket>().not.toHaveProperty("message");
    expectTypeOf<EventPacket>().not.toHaveProperty("raw");
    expectTypeOf<OkPacket>().toHaveProperty("from");
    expectTypeOf<OkPacket>().toHaveProperty("message");
    expectTypeOf<OkPacket>().not.toHaveProperty("raw");
  });

  test("normalizes relay input and ignores invalid URLs", () => {
    const relays = new publicApi.RxRelays([
      "wss://relay.example/",
      "wss://relay.example",
      "invalid",
    ]);

    expect([...relays]).toEqual(["wss://relay.example"]);
    relays.dispose();
  });
});
