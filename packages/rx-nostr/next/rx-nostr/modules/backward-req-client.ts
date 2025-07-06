import { type Observable } from "rxjs";
import { once, type RelayMapOperator } from "../../libs/index.ts";
import type { EventPacket } from "../../packets/index.ts";
import type { RxReq } from "../../rx-req/index.ts";
import type { RelayCommunication } from "../relay-communication.ts";

export class BackwardReqClient {
  constructor(private relays: RelayMapOperator<RelayCommunication>) {}

  req({
    rxReq,
    relays,
    config,
  }: {
    rxReq: RxReq;
    relays: RxRelays | Iterable<string>;
    config: FilledRxNostrReqOptions;
  }): Observable<EventPacket> {}

  [Symbol.dispose] = once(() => {});
  dispose = this[Symbol.dispose];
}
