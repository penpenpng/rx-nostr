import { describe, expect, test } from "vitest";

import { Faker } from "../../__test__/helper/faker.ts";
import { compareEvents, earlierEvent, ensureEventFields, laterEvent } from "./event.ts";

describe("EVENT structural guard", () => {
  const valid = Faker.event({ id: "short-protocol-id", sig: "short-protocol-signature" });

  test("accepts a structural EVENT without promising cryptographic validity", () => {
    expect(ensureEventFields(valid)).toBe(true);
    expect(ensureEventFields({ ...valid, tags: [["e", "reference"]] })).toBe(true);
    expect(ensureEventFields({ ...valid, created_at: -1 })).toBe(true);
  });

  test.each([
    null,
    [],
    { ...valid, tags: null },
    { ...valid, tags: [[]] },
    { ...valid, tags: [["e", 1]] },
    { ...valid, tags: [["e", true]] },
    { ...valid, tags: [["e", null]] },
    { ...valid, kind: NaN },
    { ...valid, kind: Infinity },
    { ...valid, kind: 65_536 },
    { ...valid, created_at: NaN },
    { ...valid, created_at: Infinity },
    { ...valid, content: undefined },
  ])("rejects a malformed EVENT without throwing: %o", (value) => {
    expect(ensureEventFields(value)).toBe(false);
  });
});

describe("event chronological order", () => {
  const older = Faker.event({ id: "d", created_at: 1 });
  const a = Faker.event({ id: "a", created_at: 2 });
  const b = Faker.event({ id: "b", created_at: 2 });
  const c = Faker.event({ id: "c", created_at: 2 });

  test("treats a smaller ID as newer at the same timestamp", () => {
    expect(compareEvents(b, a)).toBeLessThan(0);
    expect(compareEvents(a, b)).toBeGreaterThan(0);
    expect(earlierEvent(a, b)).toBe(b);
    expect(earlierEvent(b, a)).toBe(b);
    expect(laterEvent(a, b)).toBe(a);
    expect(laterEvent(b, a)).toBe(a);
  });

  test("keeps timestamp priority, equality, antisymmetry and transitivity", () => {
    expect(compareEvents(older, c)).toBeLessThan(0);
    expect(compareEvents(c, older)).toBeGreaterThan(0);
    expect(compareEvents(a, a)).toBe(0);
    expect(compareEvents(Faker.event({ id: "a", created_at: 3 }), a)).toBe(0);

    for (const left of [older, a, b, c]) {
      for (const right of [older, a, b, c]) {
        expect(compareEvents(left, right) + compareEvents(right, left)).toBe(0);
      }
    }

    expect(compareEvents(older, c)).toBeLessThan(0);
    expect(compareEvents(c, b)).toBeLessThan(0);
    expect(compareEvents(older, b)).toBeLessThan(0);
    expect(compareEvents(b, a)).toBeLessThan(0);
    expect(compareEvents(older, a)).toBeLessThan(0);
  });
});
