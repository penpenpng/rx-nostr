import type { RelayUrl } from "../../libs/index.ts";
import type { IRelayCommunication } from "./relay-communication.interface.ts";

export interface IRelayCommunicationCollection<
  T extends IRelayCommunication = IRelayCommunication,
> {
  get(relay: RelayUrl): T;
  forEach(relays: Iterable<RelayUrl> | null | undefined, callback: (value: T) => void): void;
  map<R>(relays: Iterable<RelayUrl> | null | undefined, project: (value: T) => R): R[];
}
