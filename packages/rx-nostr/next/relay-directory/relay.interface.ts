import type * as Nostr from "nostr-typedef";
import type { BehaviorSubject } from "rxjs";
import type { ConnectionState } from "../types/index.ts";

export interface IRelay {
  retry(): void;
  readonly url: string;
  readonly lastRetriedAt?: number;
  readonly consecutiveRetries: number;
  readonly lastConnectedAt?: number;
  readonly connections: number; // TODO
  readonly nip11?: Nostr.Nip11.RelayInfo;
  readonly nip11FetchedAt?: number;
}

export interface IRelayInternal extends IRelay {
  /** @internal */
  _fetchNip11(): Promise<Nostr.Nip11.RelayInfo>;
  /** @internal */
  _setConnectionState$(stream: BehaviorSubject<ConnectionState>): void;
}
