import { expect, test } from "vitest";

import { delegateSigner, seckeySigner } from "../config/index.js";
import { verify } from "../nostr/event.js";
import { validateDelegation } from "../nostr/nip26.js";

const seckeyRoot =
  "c80540cf9cacfa116ebb1561d71c5164deb9f881403f6a78641e1364eb441e2a";
const seckeyChild =
  "612d725067337d9eeb2f5a86127e3993e16787201aeed29afbd3f029f405146e";
const seckeyAttacker =
  "ed64a199624409d0be9b737861b48fcd979e5108894e745fa2641ab6234a64c9";

test("It can validate valid delegated events", async () => {
  const signer = delegateSigner({
    delegateeSigner: seckeySigner(seckeyChild),
    delegatorSeckey: seckeyRoot,
    allowedKinds: [1],
    allowedSince: 500,
    allowedUntil: 1000,
  });

  const event = await signer.signEvent({
    kind: 1,
    content: "foo",
    created_at: 750,
  });

  expect(verify(event)).toBe(true);
  expect(validateDelegation(event)).toBe(true);
});

test("It can validate invalid delegated events - out of datetime range", async () => {
  const signer = delegateSigner({
    delegateeSigner: seckeySigner(seckeyChild),
    delegatorSeckey: seckeyRoot,
    allowedKinds: [1],
    allowedSince: 500,
    allowedUntil: 1000,
  });

  const event = await signer.signEvent({
    kind: 1,
    content: "foo",
    created_at: 2000,
  });

  expect(verify(event)).toBe(true);
  expect(validateDelegation(event)).toBe(false);
});

test("It can validate invalid delegated events - kinds not allowed", async () => {
  const signer = delegateSigner({
    delegateeSigner: seckeySigner(seckeyChild),
    delegatorSeckey: seckeyRoot,
    allowedKinds: [1],
    allowedSince: 500,
    allowedUntil: 1000,
  });

  const event = await signer.signEvent({
    kind: 2,
    content: "foo",
    created_at: 750,
  });

  expect(verify(event)).toBe(true);
  expect(validateDelegation(event)).toBe(false);
});

test("It can validate invalid delegated events - stolen tag", async () => {
  const signer = delegateSigner({
    delegateeSigner: seckeySigner(seckeyChild),
    delegatorSeckey: seckeyRoot,
    allowedKinds: [1],
    allowedSince: 500,
    allowedUntil: 1000,
  });

  const event = await signer.signEvent({
    kind: 1,
    content: "foo",
    created_at: 750,
  });
  const maliciousEvent = await seckeySigner(seckeyAttacker).signEvent({
    kind: 1,
    content: "foo",
    created_at: 750,
    tags: event.tags,
  });

  expect(verify(maliciousEvent)).toBe(true);
  expect(validateDelegation(maliciousEvent)).toBe(false);
});
