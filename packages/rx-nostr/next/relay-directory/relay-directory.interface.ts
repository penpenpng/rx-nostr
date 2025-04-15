import type { IRelay, IRelayInternal } from "./relay.interface.ts";

export interface IRelayDirectory {
  get(url: string): IRelay | undefined;
  serialize(): string;
  deserialize(data: string): void;
}

export interface IRelayDirectoryInternal extends IRelayDirectory {
  /** @internal */
  _getOrCreate(url: string): IRelayInternal;
}
