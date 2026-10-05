import { expect, test } from "vitest";

import { assertTimerDuration, MAX_TIMER_DELAY } from "./timing.ts";

test.each([0, 1, MAX_TIMER_DELAY, Infinity])("accepts a supported timer duration: %s", (value) => {
  expect(assertTimerDuration(value, "duration", { allowZero: true, allowInfinity: true })).toBe(
    value,
  );
});

test.each([NaN, -Infinity, -1, MAX_TIMER_DELAY + 1])(
  "rejects an unsupported timer duration: %s",
  (value) => {
    expect(() =>
      assertTimerDuration(value, "duration", { allowZero: true, allowInfinity: true }),
    ).toThrow(RangeError);
  },
);

test("positive finite durations reject zero and Infinity", () => {
  expect(() => assertTimerDuration(0, "connectionTimeout")).toThrow(RangeError);
  expect(() => assertTimerDuration(Infinity, "connectionTimeout")).toThrow(RangeError);
});
