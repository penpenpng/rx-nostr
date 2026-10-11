import { afterEach, expect, test, vi } from "vitest";

import signedEvent from "../../../test-fixtures/signed-event.json";
import { RxNostrEnvironmentError } from "../libs/error.ts";
import { Nip07Signer } from "./nip07-signer.ts";

afterEach(() => vi.unstubAllGlobals());

test("rejects missing provider access asynchronously, including outside a browser", async () => {
  vi.stubGlobal("window", undefined);
  const signer = new Nip07Signer();
  let result!: Promise<string>;

  expect(() => {
    result = signer.getPublicKey();
  }).not.toThrow();
  await expect(result).rejects.toBeInstanceOf(RxNostrEnvironmentError);
  await expect(signer.signEvent({ kind: 1, content: "test" })).rejects.toBeInstanceOf(
    RxNostrEnvironmentError,
  );
});

test("preserves signed input and delegates unsigned input to the provider", async () => {
  const signEvent = vi.fn(async () => signedEvent);
  const getPublicKey = vi.fn(async () => signedEvent.pubkey);

  vi.stubGlobal("window", { nostr: { signEvent, getPublicKey } });
  const signer = new Nip07Signer();

  await expect(signer.signEvent(signedEvent)).resolves.toEqual(signedEvent);
  expect(signEvent).not.toHaveBeenCalled();
  await expect(signer.getPublicKey()).resolves.toBe(signedEvent.pubkey);
  await signer.signEvent({ kind: 1, content: "test", created_at: 0, tags: [["client", "test"]] });
  expect(signEvent).toHaveBeenCalledWith({
    kind: 1,
    content: "test",
    created_at: 0,
    tags: [["client", "test"]],
    pubkey: signedEvent.pubkey,
  });
});

test("rejects synchronous provider errors through getPublicKey's Promise", async () => {
  const cause = new Error("provider failed");

  vi.stubGlobal("window", {
    nostr: {
      getPublicKey() {
        throw cause;
      },
    },
  });
  await expect(new Nip07Signer().getPublicKey()).rejects.toBe(cause);
});
