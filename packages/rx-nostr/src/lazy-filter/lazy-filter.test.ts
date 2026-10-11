import { describe, expect, test } from "vitest";

import { Faker } from "../__test__/helper/faker.ts";
import { isFiltered } from "../libs/nostr/filter.ts";
import { evalFilters } from "./lazy-filter.ts";

describe("zero-valued time boundaries", () => {
  test.each([0, () => 0])("keeps until: %s and matches the inclusive boundary", (until) => {
    const [filter] = evalFilters({ until });

    expect(filter).toHaveProperty("until", 0);
    expect(isFiltered(Faker.event({ created_at: 0 }), filter!)).toBe(true);
    expect(isFiltered(Faker.event({ created_at: 1 }), filter!)).toBe(false);
    expect(isFiltered(Faker.event({ created_at: 0 }), filter!, { untilExclusive: true })).toBe(
      false,
    );
  });

  test.each([0, () => 0])("keeps since: %s and respects exclusive matching", (since) => {
    const [filter] = evalFilters({ since });

    expect(filter).toHaveProperty("since", 0);
    expect(isFiltered(Faker.event({ created_at: 0 }), filter!)).toBe(true);
    expect(isFiltered(Faker.event({ created_at: 1 }), filter!)).toBe(true);
    expect(isFiltered(Faker.event({ created_at: 0 }), filter!, { sinceExclusive: true })).toBe(
      false,
    );
    expect(isFiltered(Faker.event({ created_at: 1 }), filter!, { sinceExclusive: true })).toBe(
      true,
    );
  });

  test("evaluates lazy boundaries again on each call", () => {
    let time = 0;
    const filters = [{ until: () => time }];

    expect(evalFilters(filters)[0]).toHaveProperty("until", 0);

    time = 1;

    expect(evalFilters(filters)[0]).toHaveProperty("until", 1);
  });
});
