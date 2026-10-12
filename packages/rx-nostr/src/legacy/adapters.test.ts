import { describe, expect, test } from "vitest";

import { SimpleAuthenticator, type Nip42Authenticator } from "../authenticator/index.ts";
import { NoopSigner } from "../event-signer/index.ts";
import { withLegacyAuthTimeout } from "./adapters.ts";

const relay = "wss://relay.example.com";

describe("withLegacyAuthTimeout", () => {
  test("keeps prototype methods and the original receiver", async () => {
    const authenticator = new SimpleAuthenticator(new NoopSigner());
    const adapted = withLegacyAuthTimeout(authenticator, 100) as Nip42Authenticator;

    await expect(adapted.challenge(relay, "test")).resolves.toMatchObject({
      kind: 22242,
      tags: [
        ["relay", relay],
        ["challenge", "test"],
      ],
    });
    expect(adapted.authTimeout).toBe(authenticator.authTimeout);

    class PrivateAuthenticator implements Nip42Authenticator {
      readonly #value = "private";

      challenge() {
        if (this.#value !== "private") {
          throw new Error("wrong receiver");
        }

        return Promise.resolve({ kind: 22242 } as Awaited<
          ReturnType<Nip42Authenticator["challenge"]>
        >);
      }
    }

    const privateAdapter = withLegacyAuthTimeout(
      new PrivateAuthenticator(),
      20,
    ) as Nip42Authenticator;

    await expect(privateAdapter.challenge(relay, "test")).resolves.toHaveProperty("kind", 22242);
    expect(privateAdapter.authTimeout).toBe(20);
  });

  test("preserves explicit zero and Infinity timeouts without mutating originals", () => {
    for (const value of [0, Infinity]) {
      const authenticator: Nip42Authenticator = {
        authTimeout: value,
        challenge: async () =>
          ({ kind: 22242 }) as Awaited<ReturnType<Nip42Authenticator["challenge"]>>,
      };
      const adapted = withLegacyAuthTimeout(authenticator, 10) as Nip42Authenticator;

      expect(adapted.authTimeout).toBe(value);
      expect(authenticator.authTimeout).toBe(value);
      expect(adapted).not.toBe(authenticator);
    }
  });

  test("supports a class factory and its undefined opt-out", async () => {
    class PrivateAuthenticator implements Nip42Authenticator {
      readonly #relay: string;

      constructor(relayUrl: string) {
        this.#relay = relayUrl;
      }

      challenge() {
        return Promise.resolve({
          kind: 22242,
          tags: [["relay", this.#relay]],
        } as Awaited<ReturnType<Nip42Authenticator["challenge"]>>);
      }
    }

    const factory = withLegacyAuthTimeout(
      (relayUrl) => (relayUrl === relay ? new PrivateAuthenticator(relayUrl) : undefined),
      75,
    );

    if (typeof factory !== "function") {
      throw new Error("Expected authenticator factory");
    }

    const instance = factory(relay);

    await expect(instance?.challenge(relay, "test")).resolves.toMatchObject({
      tags: [["relay", relay]],
    });
    expect(instance?.authTimeout).toBe(75);
    expect(factory("wss://other.example.com")).toBeUndefined();
  });
});
