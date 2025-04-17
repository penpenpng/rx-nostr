import { from, type ObservableInput, type OperatorFunction } from "rxjs";
import type { EventPacket } from "../../packets/index.ts";
import { createTie } from "./create-tie.ts";

/**
 * Drop the event if it has already been seen,
 * then record on which relay the event was seen.
 */
export function tie<P extends EventPacket>(
  flushes?: ObservableInput<unknown>,
): OperatorFunction<P, P & { seenOn: Set<string> }> {
  const [fn, memo] = createTie<P>();

  if (flushes) {
    from(flushes).subscribe(() => {
      memo.clear();
    });
  }

  return fn;
}
