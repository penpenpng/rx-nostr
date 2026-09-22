import { describe, expect, expectTypeOf, test } from "vitest";
import * as publicApi from "rx-nostr";
import type {
  Authenticator,
  EventPacket,
  IRxNostr,
  OkPacket,
  Publication,
  RelayInput,
  RelayUrl,
  RxNostr,
  RxNostrConfig,
  RxNostrPublishConfig,
  RxNostrReqConfig,
  RxNostrReqInput,
  RxNostrStaticDefaultConfig,
  RxNostrStaticDefaultOptions,
} from "rx-nostr";

describe("public entry point", () => {
  test("can be imported by contract tests", () => {
    expect(publicApi).toBeTypeOf("object");
    expect(publicApi.RxNostr).toBeTypeOf("function");
    expect(publicApi.RelayDirectory).toBeTypeOf("function");
    expect(publicApi.GlobalRelayDirectory).toBeInstanceOf(publicApi.RelayDirectory);
    expect(publicApi).not.toHaveProperty("createRxNostr");
    expect(publicApi).not.toHaveProperty("NostrTransport");
    expect(publicApi).not.toHaveProperty("Unipls");
  });

  test("exposes the v4 operation model", () => {
    expectTypeOf<RxNostr>().toMatchTypeOf<IRxNostr>();
    expectTypeOf<Authenticator>().toHaveProperty("authTimeout");
    expectTypeOf<RxNostrConfig>().not.toHaveProperty("authTimeout");
    expectTypeOf(publicApi.RxNostr.defaultConfig).toEqualTypeOf<RxNostrStaticDefaultConfig>();
    expectTypeOf(publicApi.RxNostr.defaultOptions).toEqualTypeOf<RxNostrStaticDefaultOptions>();
    expectTypeOf<Parameters<IRxNostr["req"]>[0]>().toEqualTypeOf<RelayInput>();
    expectTypeOf<Parameters<IRxNostr["req"]>[1]>().toEqualTypeOf<RxNostrReqInput>();
    expectTypeOf<Parameters<IRxNostr["req"]>[2]>().toEqualTypeOf<RxNostrReqConfig | undefined>();
    expectTypeOf<Parameters<IRxNostr["publish"]>[0]>().toEqualTypeOf<RelayInput>();
    expectTypeOf<Parameters<IRxNostr["publish"]>[2]>().toEqualTypeOf<
      RxNostrPublishConfig | undefined
    >();
    expectTypeOf<IRxNostr["publish"]>().returns.toEqualTypeOf<Publication>();
    expectTypeOf<Publication["waitFor"]>().returns.toEqualTypeOf<Promise<void>>();
    expectTypeOf<string>().toMatchTypeOf<RelayInput>();
    expectTypeOf<string[]>().toMatchTypeOf<RelayInput>();
    expectTypeOf<"ws://relay.example">().toMatchTypeOf<RelayUrl>();
  });

  test("exposes built-in values through static operation defaults", () => {
    const previous = publicApi.RxNostr.defaultOptions;

    try {
      expect(previous).toMatchObject({
        req: {
          defer: true,
          linger: 10_000,
          skipExpirationCheck: false,
          skipValidateFilterMatching: false,
          timeout: 30_000,
          weak: false,
        },
        publish: { linger: 10_000, timeout: 30_000, weak: false },
      });
      publicApi.RxNostr.defaultOptions = {
        req: { ...previous.req, linger: 123 },
        publish: { ...previous.publish },
      };

      const client = new publicApi.RxNostr({ verifier: new publicApi.NoopVerifier() });
      expect(client).toBeInstanceOf(publicApi.RxNostr);
      client.dispose();
    } finally {
      publicApi.RxNostr.defaultOptions = previous;
    }
  });

  test("exposes constructor defaults in their own static namespace", async () => {
    const defaults = publicApi.RxNostr.defaultConfig;

    await expect(defaults.verifier.verifyEvent({} as never)).rejects.toThrow(
      "You must configure a valid verifier",
    );
    expect(defaults.signer).toBeInstanceOf(publicApi.Nip07Signer);
    expect(defaults.retry).toBeInstanceOf(publicApi.ExponentialBackoffRetryer);
    expect(defaults.relayDirectory).toBe(publicApi.GlobalRelayDirectory);
    expect(defaults.skipFetchNip11).toBe(false);
  });

  test("keeps IRxNostr independent from the concrete class", () => {
    const dispose = () => {};
    const structuralClient = {
      req: undefined as unknown as IRxNostr["req"],
      publish: undefined as unknown as IRxNostr["publish"],
      setHotRelays: undefined as unknown as IRxNostr["setHotRelays"],
      unsetHotRelays: undefined as unknown as IRxNostr["unsetHotRelays"],
      monitorConnectionState: undefined as unknown as IRxNostr["monitorConnectionState"],
      dispose,
      [Symbol.dispose]: dispose,
    } satisfies IRxNostr;
    const acceptClient = (client: IRxNostr) => client;

    expect(acceptClient(structuralClient)).toBe(structuralClient);
    expect(structuralClient).not.toBeInstanceOf(publicApi.RxNostr);
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
