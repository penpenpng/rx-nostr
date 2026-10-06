export const MAX_TIMER_DELAY = 2_147_483_647;

/** Validate a duration before it can create a timer or retain a resource. */
export function assertTimerDuration(
  value: number,
  name: string,
  options: { allowZero?: boolean; allowInfinity?: boolean } = {},
): number {
  if (
    (options.allowInfinity && value === Infinity) ||
    (Number.isFinite(value) &&
      (options.allowZero ? value >= 0 : value > 0) &&
      value <= MAX_TIMER_DELAY)
  ) {
    return value;
  }

  const range = options.allowZero
    ? `between 0 and ${MAX_TIMER_DELAY} ms`
    : `greater than 0 and at most ${MAX_TIMER_DELAY} ms`;
  const infinity = options.allowInfinity ? ", or Infinity" : "";

  throw new RangeError(`${name} must be ${range}${infinity}.`);
}
