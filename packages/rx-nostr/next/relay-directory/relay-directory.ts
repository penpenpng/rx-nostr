import { RelayMap } from "../libs/relay-collections.ts";
import type {
  IRelayDirectory,
  IRelayDirectoryInternal,
} from "./relay-directory.interface.ts";
import type { IRelay, IRelayInternal } from "./relay.interface.ts";
import { Relay } from "./relay.ts";

export class RelayDirectory
  implements IRelayDirectory, IRelayDirectoryInternal
{
  #relays = new RelayMap<IRelayInternal>();

  get(url: string): IRelay | undefined {
    return this.#relays.get(url);
  }

  serialize(): string {
    throw new Error("Not implemented");
  }

  deserialize(data: string): void {
    throw new Error("Not implemented");
  }

  _getOrCreate(url: string): IRelayInternal {
    const relay = new Relay(url);
    this.#relays.set(url, relay);
    return relay;
  }
}

export const GlobalRelayDirectory: IRelayDirectory = new RelayDirectory();
