import type { LazyFilter } from "../lazy-filter/index.ts";
import type { RxRelays } from "../rx-relays/index.ts";
import type { IRxReq } from "../rx-req/index.ts";

export interface IRxNostr {
  keep(rxRelays: RxRelays): void;
  release(rxRelays: RxRelays): void;

  req(rxReq: IRxReq, config: ReqConfig): void;
  req(filters: LazyFilter[], config: ReqConfig): void;
  event(): void;
}

export interface ReqConfig {
  relays: RxRelays | string[];
  keep?: { begin: "immediately" | "ondemand"; while: "emit" | "req" };
}
