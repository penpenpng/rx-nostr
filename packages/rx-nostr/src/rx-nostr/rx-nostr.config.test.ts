import { describe, expect, test } from "vitest";
import { ExponentialBackoffRetryer } from "../connection-retryer/index.ts";
import { NoopSigner } from "../event-signer/index.ts";
import { NoopVerifier } from "../event-verifier/index.ts";
import { RxNostrInvalidUsageError } from "../libs/error.ts";
import { GlobalRelayDirectory, RelayDirectory } from "../relay-directory/index.ts";
import {
  FilledRxNostrConfig,
  FilledRxNostrPublishOptions,
  FilledRxNostrReqOptions,
  RX_NOSTR_DEFAULT_OPTIONS,
} from "./rx-nostr.config.ts";
import type { RxNostrConfig, RxNostrStaticDefaultOptions } from "./rx-nostr.interface.ts";

const createRoot = (config: Partial<RxNostrConfig> = {}) =>
  new FilledRxNostrConfig(
    {
      verifier: new NoopVerifier(),
      ...config,
    },
    RX_NOSTR_DEFAULT_OPTIONS,
  );

describe("rx-nostr config", () => {
  test("applies the v4 operation defaults", () => {
    const root = createRoot();
    const req = new FilledRxNostrReqOptions({}, root);
    const publish = new FilledRxNostrPublishOptions({}, root);

    expect(req).toMatchObject({
      defer: true,
      linger: 10_000,
      skipExpirationCheck: false,
      skipValidateFilterMatching: false,
      timeout: 30_000,
      weak: false,
    });
    expect(publish).toMatchObject({
      linger: 10_000,
      timeout: 30_000,
      weak: false,
    });
    expect(root.authenticator).toBeUndefined();
    expect(root.retry).toBeInstanceOf(ExponentialBackoffRetryer);
    expect(root.relayDirectory).toBe(GlobalRelayDirectory);
  });

  test("preserves explicit false, zero, and Infinity values", () => {
    const root = createRoot({
      defaultOptions: {
        req: { defer: false, linger: Infinity, weak: true },
        publish: { linger: Infinity, timeout: 0, weak: true },
      },
    });
    const req = new FilledRxNostrReqOptions({ defer: false, linger: 0, weak: false }, root);
    const publish = new FilledRxNostrPublishOptions(
      { linger: 0, timeout: Infinity, weak: false },
      root,
    );

    expect(req.defer).toBe(false);
    expect(req.linger).toBe(0);
    expect(req.weak).toBe(false);
    expect(publish.linger).toBe(0);
    expect(publish.timeout).toBe(Infinity);
    expect(publish.weak).toBe(false);
  });

  test("applies operation, instance, and static precedence", () => {
    const instanceSigner = new NoopSigner();
    const staticOptions: RxNostrStaticDefaultOptions = {
      req: {
        ...RX_NOSTR_DEFAULT_OPTIONS.req,
        defer: false,
        linger: 1_000,
        timeout: 4_000,
        weak: true,
      },
      publish: {
        ...RX_NOSTR_DEFAULT_OPTIONS.publish,
        linger: 3_000,
        signer: new NoopSigner(),
        timeout: 5_000,
        weak: true,
      },
    };
    const root = new FilledRxNostrConfig(
      {
        verifier: new NoopVerifier(),
        signer: instanceSigner,
        defaultOptions: {
          req: { linger: 2_000 },
          publish: { weak: false },
        },
      },
      staticOptions,
    );

    const req = new FilledRxNostrReqOptions({ linger: 0 }, root);
    const publish = new FilledRxNostrPublishOptions({ timeout: Infinity }, root);

    expect(req).toMatchObject({ defer: false, linger: 0, timeout: 4_000, weak: true });
    expect(publish).toMatchObject({ linger: 3_000, timeout: Infinity, weak: false });
    expect(publish.signer).toBe(instanceSigner);
  });

  test("snapshots static operation defaults for each root config", () => {
    const staticOptions: RxNostrStaticDefaultOptions = {
      req: { ...RX_NOSTR_DEFAULT_OPTIONS.req, linger: 1_000 },
      publish: { ...RX_NOSTR_DEFAULT_OPTIONS.publish },
    };
    const root = new FilledRxNostrConfig({ verifier: new NoopVerifier() }, staticOptions);

    staticOptions.req.linger = 2_000;

    expect(new FilledRxNostrReqOptions({}, root).linger).toBe(1_000);
  });

  test("creates stateful defaults only once per root config", () => {
    const root = createRoot();

    expect(root.signer).toBe(root.signer);
    expect(root.retry).toBe(root.retry);
    expect(root.defaultOptions).toBe(root.defaultOptions);
  });

  test("accepts an injected relay directory", () => {
    const relayDirectory = new RelayDirectory();
    expect(createRoot({ relayDirectory }).relayDirectory).toBe(relayDirectory);
  });

  test("AUTH is opt-in and can be disabled per operation", () => {
    const authenticator = {
      challenge: async () => {
        throw new Error("not called");
      },
    };
    const root = createRoot({ authenticator });

    expect(new FilledRxNostrReqOptions({}, root).authenticator).toBe(authenticator);
    expect(
      new FilledRxNostrPublishOptions({ authenticator: false }, root).authenticator,
    ).toBeUndefined();
  });

  test("rejects a missing verifier at the config boundary", () => {
    expect(
      () => new FilledRxNostrConfig({} as RxNostrConfig, RX_NOSTR_DEFAULT_OPTIONS),
    ).toThrowError(RxNostrInvalidUsageError);
  });
});
