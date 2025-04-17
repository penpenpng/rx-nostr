import { from, mergeMap, type OperatorFunction } from "rxjs";
import type { LazyFilter } from "../../lazy-filter/index.ts";
import type { ReqPacket } from "../../packets/index.ts";

/**
 * Map REQ packets into a single REQ packet.
 *
 * It is useful to reduce REQ requests in a time interval.
 */
export function batch(
  /** Function used for merge REQ filters. Default behavior is simple concatenation. */
  mergeFilter?: MergeFilter,
): OperatorFunction<ReqPacket[], ReqPacket> {
  return mergeMap((packets) => {
    const batched: ReqPacket[] = [];
    for (const packetGroup of groupByRelays(packets)) {
      if (!packetGroup[0]) {
        continue;
      }

      const foldedFilters = packetGroup
        .map(({ filters }) => filters)
        .reduce((acc, v) => (mergeFilter ?? defaultMergeFilter)(acc, v), []);

      batched.push({ ...packetGroup[0], filters: foldedFilters });
    }

    return from(batched);
  });
}

export type MergeFilter = (a: LazyFilter[], b: LazyFilter[]) => LazyFilter[];

function defaultMergeFilter(a: LazyFilter[], b: LazyFilter[]): LazyFilter[] {
  return [...a, ...b];
}

function groupByRelays(packets: ReqPacket[]): ReqPacket[][] {
  const groups: Record<string, ReqPacket[]> = {};
  const toKey = (relays: string[] | undefined): string => (relays ? relays.join(",") : "*");

  for (const packet of packets) {
    // FIXME
    const key = toKey(packet.relays);
    groups[key] ??= [];
    groups[key].push(packet);
  }

  return Object.values(groups);
}
