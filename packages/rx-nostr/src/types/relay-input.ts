import type { ReadonlyRxRelays } from "../rx-relays/index.ts";

/** A relay destination or a reactive set of relay destinations. */
export type RelayInput = ReadonlyRxRelays | readonly string[] | ReadonlySet<string> | string;
