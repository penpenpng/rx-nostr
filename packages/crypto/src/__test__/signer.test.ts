import { describe, expect, test } from "vitest";

import { seckeySigner } from "../signer.js";
import { verifier } from "../verifier.js";

const nsec = "nsec1r9k9t5h0xd7fkzmhkzvdsdwv3gauy62st2xkh3alkj9lwwdlmnzsxc9ahm";
const sechex =
  "196c55d2ef337c9b0b77b098d835cc8a3bc269505a8d6bc7bfb48bf739bfdcc5";
const pubhex =
  "a95f1014a2fb73820e79ea3658710eb1b14aa01a9f963436338586e303ee5966";

describe("seckeySigner()", () => {
  test("generates a correct pubhex from nsec", async () => {
    const signer = seckeySigner(nsec);

    await expect(signer.getPublicKey()).resolves.toBe(pubhex);
  });

  test("generates a correct pubhex from sechex", async () => {
    const signer = seckeySigner(sechex);

    await expect(signer.getPublicKey()).resolves.toBe(pubhex);
  });

  test("signs an event correctly", async () => {
    const signer = seckeySigner(sechex);
    const event = await signer.signEvent({ kind: 1, content: "Hello World" });

    await expect(verifier(event)).resolves.toBe(true);
  });
});
