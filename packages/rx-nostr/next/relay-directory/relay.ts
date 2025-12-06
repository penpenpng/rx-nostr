import type * as Nostr from "nostr-typedef";
import type { BehaviorSubject } from "rxjs";
import type { ConnectionState } from "../connection-state.ts";
import { fetchRelayInfo, normalizeRelayUrl } from "../libs/index.ts";
import type { IRelay, IRelayInternal } from "./relay.interface.ts";

export class Relay implements IRelay, IRelayInternal {
  url: string;
  lastRetriedAt?: number;
  consecutiveRetries: number = 0;
  lastConnectedAt?: number;
  connections: number = 0; // TODO
  nip11?: Nostr.Nip11.RelayInfo;
  nip11FetchedAt?: number;

  constructor(url: string) {
    const _url = normalizeRelayUrl(url);
    if (!_url) {
      throw new Error(`Invalid relay URL: ${url}`);
    }

    this.url = _url;
  }

  retry(): void {
    throw new Error("Not implemented");
  }

  async _fetchNip11(): Promise<Nostr.Nip11.RelayInfo> {
    const nip11 = await fetchRelayInfo(this.url);
    this.nip11 = nip11;
    this.nip11FetchedAt = Date.now();

    return nip11;
  }

  _setConnectionState$(stream: BehaviorSubject<ConnectionState>): void {
    // Calculate: lastRetriedAt, consecutiveRetries, lastConnectedAt, connections
    throw new Error("Not implemented");
  }
}
