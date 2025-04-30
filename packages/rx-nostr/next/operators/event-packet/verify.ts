import { type MonoTypeOperatorFunction } from "rxjs";
import type { EventVerifier } from "../../event-verifier/index.ts";
import type { EventPacket } from "../../packets/index.ts";
import { filterAsync } from "../filter-async.ts";

/**
 * Only events with a valid signature are allowed to pass.
 */
export function verify<P extends EventPacket>(
  verifier: EventVerifier,
): MonoTypeOperatorFunction<P> {
  return filterAsync(({ event }) => verifier.verifyEvent(event));
}
