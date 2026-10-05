import { describe, expect, test } from "vitest";

import { Faker } from "../../__test__/helper/faker.ts";
import { compareEvents, earlierEvent, laterEvent } from "./event.ts";

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
