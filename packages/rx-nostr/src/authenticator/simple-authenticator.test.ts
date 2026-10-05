import { expect, test } from "vitest";

import { NoopSigner } from "../event-signer/index.ts";
import { SimpleAuthenticator } from "./simple-authenticator.ts";

test("validates AUTH timeout before using the signer", () => {
  const signer = new NoopSigner();

  expect(new SimpleAuthenticator(signer, { authTimeout: 0 }).authTimeout).toBe(0);
  expect(new SimpleAuthenticator(signer, { authTimeout: Infinity }).authTimeout).toBe(Infinity);

  for (const authTimeout of [NaN, -Infinity, -1, 2_147_483_648]) {
    expect(() => new SimpleAuthenticator(signer, { authTimeout })).toThrow(RangeError);
  }
});
