import { once, type RelayMapOperator } from "../libs/index.ts";
import type { RelayCommunication } from "./relay-communication.ts";

export class ForwardReqClient {
  constructor(private relays: RelayMapOperator<RelayCommunication>) {}

  [Symbol.dispose] = once(() => {});
  dispose = this[Symbol.dispose];
}
