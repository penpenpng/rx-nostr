import { type Observable } from "rxjs";
import { once, type RelayMapOperator } from "../../libs/index.ts";
import type { EventPacket } from "../../packets/index.ts";
import type { RxReq } from "../../rx-req/index.ts";
import type { RelayCommunication } from "../relay-communication.ts";
import type { RelayInput } from "../rx-nostr.interface";

export class BackwardReqClient {
  constructor(private relays: RelayMapOperator<RelayCommunication>) {}

  req({
    rxReq,
    relays,
    config,
  }: {
    rxReq: RxReq;
    relays: RelayInput;
    config: FilledRxNostrReqOptions;
  }): Observable<EventPacket> {}

  [Symbol.dispose] = once(() => {});
  dispose = this[Symbol.dispose];
}
