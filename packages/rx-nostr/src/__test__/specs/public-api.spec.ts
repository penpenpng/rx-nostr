import type {
  Authenticator,
  ConnectionFailure,
  ConnectionState,
  ConnectionStatePacket,
  ConnectionDropDetector,
  ConnectionDropDetectorContext,
  ConnectionReconnector,
  EventPacket,
  IRxNostr,
  OkPacket,
  Publication,
  RelayInput,
  RelayUrl,
  RxNostr,
  RxNostrConfig,
  RxNostrDiagnostic,
  RxNostrDiagnosticSink,
  RxNostrPublishConfig,
  RxNostrReqConfig,
  RxNostrReqInput,
  RxNostrStaticDefaultConfig,
  RxNostrStaticDefaultOptions,
} from "rx-nostr";
import * as publicApi from "rx-nostr";
import type { Observable } from "rxjs";
import { describe, expect, expectTypeOf, test } from "vitest";

describe("public entry point", () => {
  describe("runtime exports", () => {
    test("can be imported by contract tests", () => {
      expect(publicApi).toBeTypeOf("object");
      expect(publicApi.RxNostr).toBeTypeOf("function");
      expect(publicApi.RelayDirectory).toBeTypeOf("function");
      expect(publicApi.GlobalRelayDirectory).toBeInstanceOf(publicApi.RelayDirectory);
    });
  });

  describe("type surface", () => {
    test("exposes the process-wide log sink and authentication types", () => {
      expectTypeOf<RxNostr>().toMatchTypeOf<IRxNostr>();
      expectTypeOf(publicApi.RxNostr.logSink).toEqualTypeOf<RxNostrDiagnosticSink | undefined>();
      expectTypeOf<RxNostrDiagnostic["level"]>().toEqualTypeOf<
        "debug" | "info" | "warning" | "error"
      >();
      expectTypeOf<RxNostrDiagnostic["message"]>().toEqualTypeOf<string>();

      expectTypeOf<Authenticator>().toHaveProperty("authTimeout");
    });

    test("exposes constructor and connection policy types", () => {
      expectTypeOf<RxNostrConfig["reconnector"]>().toEqualTypeOf<
        ConnectionReconnector | undefined
      >();
      expectTypeOf<RxNostrConfig["dropDetectors"]>().toEqualTypeOf<
        Iterable<ConnectionDropDetector> | undefined
      >();

      expectTypeOf<
        Parameters<ConnectionDropDetector["setup"]>[0]
      >().toEqualTypeOf<ConnectionDropDetectorContext>();

      expectTypeOf(publicApi.RxNostr.defaultConfig).toEqualTypeOf<RxNostrStaticDefaultConfig>();
      expectTypeOf(publicApi.RxNostr.defaultOptions).toEqualTypeOf<RxNostrStaticDefaultOptions>();
    });

    test("exposes the REQ operation types", () => {
      expectTypeOf<Parameters<IRxNostr["forward"]>[0]>().toEqualTypeOf<RelayInput>();
      expectTypeOf<Parameters<IRxNostr["forward"]>[1]>().toEqualTypeOf<RxNostrReqInput>();
      expectTypeOf<Parameters<IRxNostr["forward"]>[2]>().toEqualTypeOf<
        RxNostrReqConfig | undefined
      >();
      expectTypeOf<Parameters<IRxNostr["backward"]>[0]>().toEqualTypeOf<RelayInput>();
      expectTypeOf<Parameters<IRxNostr["backward"]>[1]>().toEqualTypeOf<RxNostrReqInput>();
    });

    test("exposes publication and relay input types", () => {
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

    test("exposes connection state monitoring and snapshot types", () => {
      expectTypeOf<IRxNostr["monitorConnectionState"]>().returns.toEqualTypeOf<
        Observable<ConnectionStatePacket>
      >();

      expectTypeOf<ConnectionState>().toMatchTypeOf<
        | { state: "dormant" }
        | { state: "connecting"; attempt: number }
        | { state: "connected" }
        | {
            state: "waiting-for-retry";
            attempt: number;
            delay: number;
            reason: ConnectionFailure;
          }
        | { state: "retrying"; attempt: number }
        | { state: "failed"; attempt: number; reason: ConnectionFailure }
        | { state: "disposed" }
      >();

      expectTypeOf<ConnectionStatePacket>().toHaveProperty("from");
      expectTypeOf<ConnectionStatePacket>().toHaveProperty("state");
    });
  });

  describe("static defaults", () => {
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
      expect(defaults.reconnector).toBeInstanceOf(publicApi.ExponentialBackoffReconnector);
      expect(defaults.dropDetectors).toEqual([]);
      expect(defaults.relayDirectory).toBe(publicApi.GlobalRelayDirectory);
      expect(defaults.nip11Timeout).toBe(30_000);
      expect(defaults.skipFetchNip11).toBe(false);
    });
  });

  describe("structural API", () => {
    test("keeps IRxNostr independent from the concrete class", () => {
      const dispose = () => {};
      const structuralClient = {
        forward: undefined as unknown as IRxNostr["forward"],
        backward: undefined as unknown as IRxNostr["backward"],
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
  });

  describe("public values", () => {
    test("exposes event and acknowledgement packet fields", () => {
      expectTypeOf<EventPacket>().toHaveProperty("traceTag");

      expectTypeOf<OkPacket>().toHaveProperty("from");
      expectTypeOf<OkPacket>().toHaveProperty("message");
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
});
