import { expect, test } from "vitest";

import { verifier } from "../verifier.js";

test("verify() accepts a valid event", async () => {
  const validEvent = {
    content: "hello world",
    created_at: 1776696567,
    id: "824462311971f72d52982b9719ae2c5172faa0b28689d215a4d11dde250293f5",
    kind: 1,
    pubkey: "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
    sig: "6e0d86cc22a303782772b734c69f6b0dc4b432e5b0ed110efd95ef030c54684b8dd84a9a66f5c2acfd2778067b0034d4767f055e1aab435c6d18e4e88d7a085f",
    tags: [],
  };

  await expect(verifier(validEvent)).resolves.toBe(true);
});

test("verify() rejects an invalid event", async () => {
  const invalidEvent = {
    content: "tampered content",
    created_at: 1776696567,
    id: "824462311971f72d52982b9719ae2c5172faa0b28689d215a4d11dde250293f5",
    kind: 1,
    pubkey: "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
    sig: "6e0d86cc22a303782772b734c69f6b0dc4b432e5b0ed110efd95ef030c54684b8dd84a9a66f5c2acfd2778067b0034d4767f055e1aab435c6d18e4e88d7a085f",
    tags: [],
  };

  await expect(verifier(invalidEvent)).resolves.toBe(false);
});
