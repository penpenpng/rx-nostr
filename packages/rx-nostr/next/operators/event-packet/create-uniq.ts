import { filter, type MonoTypeOperatorFunction } from "rxjs";
import type { EventPacket } from "../../packets/index.ts";

/**
 * Create a customizable uniq operator.
 *
 * If `keyFn()` returns a non-null key, the key is stored in `Set`.
 * The operator filters packets with keys already stored.
 *
 * The `Set` returned in the second value of the tuple
 * can be manipulated externally or in optional event handlers.
 * For example, you can call `Set#clear()` to forget all keys.
 */
export function createUniq<P extends EventPacket, T>(
  keyFn: (packet: P) => T | null,
  options?: {
    onCache?: (packet: EventPacket, cache: Set<T>) => void;
    onHit?: (packet: EventPacket, cache: Set<T>) => void;
  },
): [MonoTypeOperatorFunction<P>, Set<T>] {
  const cache = new Set<T>();

  return [
    filter((packet) => {
      const key = keyFn(packet);
      if (key === null) {
        return true;
      }

      if (cache.has(key)) {
        options?.onHit?.(packet, cache);
        return false;
      } else {
        cache.add(key);
        options?.onCache?.(packet, cache);
        return true;
      }
    }),
    cache,
  ];
}
