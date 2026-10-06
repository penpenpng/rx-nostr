import { describe, expect, test } from "vitest";

import { normalizeFilters } from "./normalize-filters.ts";

const zero = () => 0;

describe("normalizeFilters", () => {
  test.each([
    { ids: [] },
    { authors: [] },
    { authors: [""] },
    { ids: [""] },
    { kinds: [] },
    { "#e": [] },
    { since: 2, until: 1 },
    { limit: -1 },
    { unknown: "value" },
  ])("drops an unsatisfiable branch without expanding it to match-all: %o", (filter) => {
    expect(normalizeFilters(filter as never)).toEqual([]);
  });

  test("distinguishes no branches from an explicit match-all filter", () => {
    expect(normalizeFilters([])).toEqual([]);
    expect(normalizeFilters({})).toEqual([{}]);
    expect(normalizeFilters([{ authors: [] }, {}])).toEqual([{}]);
  });

  test("retains valid OR branches, zero limit and lazy bounds", () => {
    expect(normalizeFilters([{ authors: [] }, { kinds: [1], limit: 0, since: zero }])).toEqual([
      { kinds: [1], limit: 0, since: zero },
    ]);
  });

  test("detaches condition arrays from input mutation", () => {
    const filter = { authors: ["first"] };
    const normalized = normalizeFilters(filter);

    filter.authors[0] = "changed";

    expect(normalized).toEqual([{ authors: ["first"] }]);
  });
});
