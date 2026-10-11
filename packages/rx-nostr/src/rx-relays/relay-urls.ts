import { RelaySet, type RelayUrl } from "../libs/relay-urls.ts";
import type { RelayInput } from "../types/relay-input.ts";
import { ReadonlyRxRelays } from "./rx-relays.ts";

// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Internal static utility namespace.
export class RelayUrls {
  static toRelaySet(relays: RelayInput | null | undefined): RelaySet {
    if (!relays) {
      return new RelaySet();
    }

    assertRelayInput(relays);

    return new RelaySet(relays);
  }

  static toArray(relays: RelayInput | null | undefined): RelayUrl[] {
    return [...RelayUrls.toRelaySet(relays)];
  }
}

export function assertRelayInput(relays: RelayInput): void {
  if (
    typeof relays !== "string" &&
    !Array.isArray(relays) &&
    !(relays instanceof Set) &&
    !(relays instanceof ReadonlyRxRelays)
  ) {
    throw new TypeError("Relay input must be a URL, an array, a Set, or RxRelays.");
  }
}
