import { EMPTY, from, mergeMap, of, type MonoTypeOperatorFunction } from "rxjs";

export function filterAsync<T>(
  predicate: (x: T, index: number) => Promise<boolean>,
): MonoTypeOperatorFunction<T> {
  return mergeMap((packet, index) =>
    from(predicate(packet, index)).pipe(
      mergeMap((result) => (result ? of(packet) : EMPTY)),
    ),
  );
}
