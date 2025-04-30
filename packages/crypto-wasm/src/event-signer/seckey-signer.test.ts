import { describe, expect, test } from "vitest";
import { verifyEvent } from "../libs/nostr/crypto.ts";
import { SeckeySigner } from "./seckey-signer.ts";

describe(SeckeySigner.name, () => {
  test("by nsec1", async () => {
    const key =
      "nsec10ula2x693q0assp0agsc9apl6vg34yz3srln5pdfqezmueuhknusfxumgl";
    const signer = new SeckeySigner(key);

    await expect(signer.getPublicKey()).resolves.toBe(
      "ac129311ffd0b65155c217d12e68dec3fac1652b310219cd11d4057714d4b98d",
    );

    const signedEvent = await signer.signEvent({
      content: "hello world",
      created_at: 1744991602,
      kind: 1,
    });
    expect(verifyEvent(signedEvent)).toBe(true);
  });

  test("by hex", async () => {
    const key =
      "7f3fd51b45881fd8402fea2182f43fd3111a905180ff3a05a90645be6797b4f9";
    const signer = new SeckeySigner(key);

    await expect(signer.getPublicKey()).resolves.toBe(
      "ac129311ffd0b65155c217d12e68dec3fac1652b310219cd11d4057714d4b98d",
    );

    const signedEvent = await signer.signEvent({
      content: "hello world",
      created_at: 1744991602,
      kind: 1,
    });
    expect(verifyEvent(signedEvent)).toBe(true);
  });
});
