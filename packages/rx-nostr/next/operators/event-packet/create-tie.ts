import { filter, map, pipe, type OperatorFunction } from "rxjs";
import type { EventPacket } from "../../packets/index.ts";

/**
 * Create a customizable tie operator.
 */
export function createTie<P extends EventPacket>(): [
  OperatorFunction<P, P & { seenOn: Set<string>; isNew: boolean }>,
  Map<string, Set<string>>,
] {
  const memo = new Map<string, Set<string>>();

  return [
    pipe(
      filter((packet) => !memo.get(packet.event.id)?.has(packet.from)),
      map((packet) => {
        const seenOn = memo.get(packet.event.id) ?? new Set<string>();
        const isNew = seenOn.size <= 0;

        seenOn.add(packet.from);
        memo.set(packet.event.id, seenOn);

        return {
          ...packet,
          seenOn,
          isNew,
        };
      }),
    ),
    memo,
  ];
}
