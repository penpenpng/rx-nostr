import { from, mergeMap, of, type MonoTypeOperatorFunction } from "rxjs";
import type { LazyFilter } from "../../lazy-filter/index.ts";
import type { ReqPacket } from "../../packets/index.ts";

/**
 * Chunk a REQ packet into multiple REQ packets.
 *
 * It is useful to avoid to send large REQ filter.
 */
export function chunk(
  predicate: (f: LazyFilter[]) => boolean,
  toChunks: (f: LazyFilter[]) => LazyFilter[][],
): MonoTypeOperatorFunction<ReqPacket> {
  return mergeMap((packet) =>
    predicate(packet.filters)
      ? from(
          toChunks(packet.filters).map((filters) => ({ ...packet, filters })),
        )
      : of(packet),
  );
}
