import { from, mergeMap, type OperatorFunction } from "rxjs";
import type { LazyFilter } from "../../lazy-filter/index.ts";
import type { ReqPacket } from "../../packets/index.ts";
import { RxRelays } from "../../rx-relays/index.ts";

/**
 * Map REQ packets into a single REQ packet.
 *
 * It is useful to reduce REQ requests in a time interval.
 */
export function batch(
  /** Function used for merge REQ filters. Default behavior is simple concatenation. */
  mergeFilter?: MergeFilterFunction,
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

export type MergeFilterFunction = (
  a: LazyFilter[],
  b: LazyFilter[],
) => LazyFilter[];

function defaultMergeFilter(a: LazyFilter[], b: LazyFilter[]): LazyFilter[] {
  return [...a, ...b];
}

function groupByRelays(packets: ReqPacket[]): ReqPacket[][] {
  const groups = new Map<string | RxRelays, ReqPacket[]>();
  const toKey = (relays: ReqPacket["relays"]): string | RxRelays => {
    if (relays === undefined) {
      return "*";
    }
    if (relays instanceof RxRelays) {
      return relays;
    }
    return [...RxRelays.set(relays)].sort().join(",");
  };

  for (const packet of packets) {
    const key = toKey(packet.relays);
    const group = groups.get(key) ?? [];
    group.push(packet);
    groups.set(key, group);
  }

  return [...groups.values()];
}
