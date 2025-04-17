import { distinct, type MonoTypeOperatorFunction, type ObservableInput } from "rxjs";
import type { EventPacket } from "../../packets/index.ts";

/**
 * Remove the events once seen.
 */
export function uniq<P extends EventPacket>(flushes?: ObservableInput<unknown>): MonoTypeOperatorFunction<P> {
  return distinct<P, string>(({ event }) => event.id, flushes);
}
