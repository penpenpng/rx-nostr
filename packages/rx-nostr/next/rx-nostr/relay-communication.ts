import type * as Nostr from "nostr-typedef";
import { EMPTY, merge, Subject, type Observable } from "rxjs";
import type { LazyFilter } from "../lazy-filter/index.ts";
import { Latch, RelayUrl, u } from "../libs/index.ts";
import type { EventPacket, ProgressActivity } from "../packets/index.ts";

export interface IRelayCommunication {
  url: RelayUrl;
  hold(): () => void;
  vreq(
    strategy: "forward" | "backward",
    filters: LazyFilter[],
  ): Observable<EventPacket>;
  event(event: Nostr.Event): Observable<ProgressActivity>;
}

// 将来、接続を多重化することがあればこのレイヤーで実装する
export class RelayCommunication implements IRelayCommunication {
  private conn: RelayConnection;
  private used = false;
  private latch = new Latch({
    onHeldUp: () => {
      this.used = true;
      this.conn.connect();
    },
    onDropped: () => {
      this.used = false;
      this.conn.disconnect();
    },
  });

  constructor(public url: RelayUrl) {
    this.conn = new RelayConnection(url);
  }

  hold() {
    return this.latch.hold();
  }

  vreq(
    strategy: "forward" | "backward",
    filters: LazyFilter[],
  ): Observable<EventPacket> {
    if (!this.used) {
      return EMPTY;
    }

    return this.conn.req(strategy, filters);
  }

  event(event: Nostr.Event): Observable<ProgressActivity> {
    if (!this.used) {
      return EMPTY;
    }

    return this.conn.event(event);
  }
}

class RelayConnection {
  socket: NostrWebsocket;

  constructor(public url: RelayUrl) {
    this.socket = new NostrWebsocket(url);
  }

  connect() {
    this.socket.connect();
  }

  disconnect() {
    this.socket.disconnect();
  }

  req(
    strategy: "forward" | "backward",
    filters: LazyFilter[],
  ): Observable<EventPacket> {
    if (strategy === "backward") {
      return;
    }

    const query = new ReqQuery(filters);

    this.socket.send(query);

    return this.socket.asObservable();
  }

  event(event: Nostr.Event): Observable<ProgressActivity> {}
}

class ReqQuery {
  constructor(public filters: LazyFilter[]) {}
}

class EventQuery {
  constructor(public event: Nostr.Event) {}
}
