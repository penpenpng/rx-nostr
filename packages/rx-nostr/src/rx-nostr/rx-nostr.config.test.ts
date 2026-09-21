import { describe, expect, test } from "vitest";
import { ExponentialBackoffRetryer } from "../connection-retryer/index.ts";
import { NoopVerifier } from "../event-verifier/index.ts";
import { RxNostrInvalidUsageError } from "../libs/error.ts";
import { GlobalRelayDirectory, RelayDirectory } from "../relay-directory/index.ts";
import {
  FilledRxNostrConfig,
  FilledRxNostrPublishOptions,
  FilledRxNostrReqOptions,
} from "./rx-nostr.config.ts";
import type { RxNostrConfig } from "./rx-nostr.interface.ts";

const createRoot = (config: Partial<RxNostrConfig> = {}) =>
  new FilledRxNostrConfig({
    verifier: new NoopVerifier(),
    ...config,
  });

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
    expect(() => new FilledRxNostrConfig({} as RxNostrConfig)).toThrowError(
      RxNostrInvalidUsageError,
    );
  });
});
