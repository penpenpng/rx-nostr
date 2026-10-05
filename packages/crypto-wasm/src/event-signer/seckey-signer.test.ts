import { describe, expect, test, vi } from "vitest";

import signedEvent from "../../../test-fixtures/signed-event.json";
import { verifyEvent } from "../libs/nostr/crypto.ts";
import { SeckeySigner } from "./seckey-signer.ts";

const keys = [
  "nsec10ula2x693q0assp0agsc9apl6vg34yz3srln5pdfqezmueuhknusfxumgl",
  "7f3fd51b45881fd8402fea2182f43fd3111a905180ff3a05a90645be6797b4f9",
];

describe(SeckeySigner.name, () => {
  test.each(keys)("signs the fixed NIP-01 vector with %s", async (key) => {
    const signer = new SeckeySigner(key);

    await expect(signer.getPublicKey()).resolves.toBe(signedEvent.pubkey);

    const signed = await signer.signEvent({
      content: signedEvent.content,
      created_at: signedEvent.created_at,
      kind: signedEvent.kind,
    });

    expect(signed.id).toBe(signedEvent.id);
    expect(signed.tags).toEqual([]);
    expect(verifyEvent(signed)).toBe(true);
  });

  test("defaults omitted tags and created_at before signing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(signedEvent.created_at * 1000);

    try {
      const signer = new SeckeySigner(keys[1]!);
      const signed = await signer.signEvent({
        content: signedEvent.content,
        kind: signedEvent.kind,
      });

      expect(signed.created_at).toBe(signedEvent.created_at);
      expect(signed.tags).toEqual([]);
      expect(signed.id).toBe(signedEvent.id);
      expect(verifyEvent(signed)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("preserves a signed input without extra tags and re-signs appended tags", async () => {
    const passthrough = await new SeckeySigner(keys[1]!).signEvent(signedEvent);

    expect(passthrough.id).toBe(signedEvent.id);
    expect(passthrough.sig).toBe(signedEvent.sig);
    expect(verifyEvent(passthrough)).toBe(true);

    const augmented = await new SeckeySigner(keys[1]!, {
      tags: [["client", "test"]],
    }).signEvent(signedEvent);

    expect(augmented.tags).toEqual([["client", "test"]]);
    expect(augmented.id).not.toBe(signedEvent.id);
    expect(augmented.pubkey).toBe(signedEvent.pubkey);
    expect(verifyEvent(augmented)).toBe(true);
    expect(signedEvent.tags).toEqual([]);
  });
});
