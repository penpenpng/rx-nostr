/** Return a function that is lazily evaluated for since/until parameters of `LazyFilter`. */
export function now(): number {
  return Math.floor(new Date().getTime() / 1000);
}
