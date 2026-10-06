import { expect, test } from "vitest";

import { verificationVectors } from "../../../test-fixtures/crypto-vectors.ts";
import { verifyEvent } from "../libs/nostr/crypto.ts";
import { SimpleVerifier } from "./simple-verifier.ts";

test.each(verificationVectors)("classifies $name", async ({ event, valid }) => {
  expect(verifyEvent(event as never)).toBe(valid);
  await expect(new SimpleVerifier().verifyEvent(event as never)).resolves.toBe(valid);
});
