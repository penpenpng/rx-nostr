import * as Nostr from "nostr-typedef";
import { filter, type MonoTypeOperatorFunction } from "rxjs";
import { xor } from "../../libs/index.ts";
import type { EventPacket } from "../../packets/index.ts";

/**
 * Only events that satisfies the PoW be allowed to pass.
 */
export function filterByPow<P extends EventPacket>(
  difficulty: number,
  options?: {
    requireTargetDifficulty?: boolean;
    not?: boolean;
  },
): MonoTypeOperatorFunction<P> {
  return filter(({ event }) =>
    xor(
      validatePow(event, difficulty, !!options?.requireTargetDifficulty),
      options?.not ?? false,
    ),
  );
}

function validatePow(
  event: Nostr.Event,
  difficulty: number,
  requireTargetDifficulty: boolean,
): boolean {
  const nonce = event.tags.find((tag) => tag[0] === "nonce");
  if (!nonce) {
    return false;
  }

  const targetDifficulty = Number(nonce[2]);
  if (requireTargetDifficulty && targetDifficulty < difficulty) {
    return false;
  }

  return countLeadingZeroes(event.id) >= difficulty;
}

// https://github.com/nostr-protocol/nips/blob/master/13.md
function countLeadingZeroes(hex: string) {
  let count = 0;

  for (let i = 0; i < hex.length; i++) {
    const nibble = parseInt(hex[i], 16);
    if (nibble === 0) {
      count += 4;
    } else {
      count += Math.clz32(nibble) - 28;
      break;
    }
  }

  return count;
}
