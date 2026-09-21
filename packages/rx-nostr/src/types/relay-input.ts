import type { RxRelays } from "../rx-relays/index.ts";

/** A relay destination or a reactive set of relay destinations. */
export type RelayInput = RxRelays | Iterable<string> | string;
