import { filter, type MonoTypeOperatorFunction } from "rxjs";
import { isExpired } from "../../libs/nostr/nip40.ts";
import type { EventPacket } from "../../packets/index.ts";

/**
 * Remove expired events. See also [NIP-40](https://github.com/nostr-protocol/nips/blob/master/40.md).
 */
export function dropExpiredEvents<P extends EventPacket>(
  now?: Date,
): MonoTypeOperatorFunction<P> {
  let refTime: number | undefined = undefined;
  if (now) {
    refTime = Math.floor(now?.getTime() / 1000);
  }

  return filter(({ event }) => !isExpired(event, refTime));
}
