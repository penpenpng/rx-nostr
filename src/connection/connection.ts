import Nostr from "nostr-typedef";
import { combineLatest, map, Observable } from "rxjs";

import type { RxNostrConfig } from "../config.js";
import { RxNostrAlreadyDisposedError } from "../error.js";
import {
  ClosedPacket,
  ConnectionState,
  ConnectionStatePacket,
  EosePacket,
  ErrorPacket,
  EventPacket,
  LazyREQ,
  MessagePacket,
  OkPacket,
  OutgoingMessagePacket,
} from "../packet.js";
import { defineDefault, normalizeRelayUrl } from "../utils.js";
import { PublishProxy } from "./publish.js";
import { RelayConnection, WebSocketCloseCode } from "./relay.js";
import { SubscribeProxy } from "./subscribe.js";

export interface SubscribeOptions {
  overwrite: boolean;
  autoclose: boolean;
  mode: REQMode;
}

/**
 * - `"weak"`: Subscriptions are active only while `keepWeakSubscriptions` is true.
 * - `"normal"`: Subscriptions are always active.
 */
export type REQMode = "weak" | "normal";

const makeSubscribeOptions = defineDefault<SubscribeOptions>({
  overwrite: false,
  autoclose: false,
  mode: "weak",
});

export class NostrConnection {
  private relay: RelayConnection;
  private pubProxy: PublishProxy;
  private subProxy: SubscribeProxy;
  private weakSubscriptionIds: Set<string> = new Set();
  private logicalConns = 0;
  private keepAlive = false;
  private keepWeakSubscriptions = false;
  private disposed = false;
  private _url: string;

  get url() {
    return this._url;
  }

  constructor(url: string, config: RxNostrConfig) {
    this._url = normalizeRelayUrl(url);
    this.relay = new RelayConnection(this.url, config);
    this.pubProxy = new PublishProxy(this.relay);
    this.subProxy = new SubscribeProxy(this.relay, config);

    // Idling cold sockets
    combineLatest([
      this.pubProxy.getLogicalConnectionSizeObservable(),
      this.subProxy.getLogicalConnectionSizeObservable(),
    ])
      .pipe(map(([pubConns, subConns]) => pubConns + subConns))
      .subscribe((logicalConns) => {
        this.logicalConns = logicalConns;

        if (!this.keepAlive && this.logicalConns <= 0) {
          this.relay.disconnect(WebSocketCloseCode.RX_NOSTR_IDLE);
        }
      });
  }

  setKeepAlive(flag: boolean): void {
    if (this.disposed) {
      return;
    }

    this.keepAlive = flag;

    if (!this.keepAlive && this.logicalConns <= 0) {
      this.relay.disconnect(WebSocketCloseCode.RX_NOSTR_IDLE);
    }
  }
  setKeepWeakSubscriptions(flag: boolean): void {
    if (this.disposed) {
      return;
    }

    this.keepWeakSubscriptions = flag;

    if (!this.keepWeakSubscriptions) {
      for (const subId of this.weakSubscriptionIds) {
        this.subProxy.unsubscribe(subId);
      }
      this.weakSubscriptionIds.clear();
    }
  }

  publish(event: Nostr.Event<number>): void {
    if (this.disposed) {
      return;
    }

    this.pubProxy.publish(event);
  }
  confirmOK(eventId: string): void {
    if (this.disposed) {
      return;
    }

    this.pubProxy.confirmOK(eventId);
  }
  subscribe(req: LazyREQ, options?: Partial<SubscribeOptions>): void {
    if (this.disposed) {
      return;
    }

    const { mode, overwrite, autoclose } = makeSubscribeOptions(options);
    const [, subId] = req;

    if (mode === "weak" && !this.keepWeakSubscriptions) {
      return;
    }
    if (!overwrite && this.subProxy.isOngoingOrQueued(subId)) {
      return;
    }

    if (mode === "weak") {
      this.weakSubscriptionIds.add(subId);
    }
    this.subProxy.subscribe(req, autoclose);
  }
  unsubscribe(subId: string): void {
    if (this.disposed) {
      return;
    }

    this.weakSubscriptionIds.delete(subId);
    this.subProxy.unsubscribe(subId);
  }

  getEventObservable(): Observable<EventPacket> {
    if (this.disposed) {
      throw new RxNostrAlreadyDisposedError();
    }

    return this.subProxy.getEventObservable();
  }
  getEoseOrClosedObservable(): Observable<EosePacket | ClosedPacket> {
    if (this.disposed) {
      throw new RxNostrAlreadyDisposedError();
    }

    return this.relay.getEOSEObservable();
  }
  getOkObservable(): Observable<OkPacket> {
    if (this.disposed) {
      throw new RxNostrAlreadyDisposedError();
    }

    return this.relay.getOKObservable();
  }
  getOtherObservable(): Observable<MessagePacket> {
    if (this.disposed) {
      throw new RxNostrAlreadyDisposedError();
    }

    return this.relay.getOtherObservable();
  }

  getOutgoingMessageObservable(): Observable<OutgoingMessagePacket> {
    if (this.disposed) {
      throw new RxNostrAlreadyDisposedError();
    }

    return this.relay.getOutgoingMessageObservable();
  }

  getConnectionStateObservable(): Observable<ConnectionStatePacket> {
    if (this.disposed) {
      throw new RxNostrAlreadyDisposedError();
    }

    return this.relay.getConnectionStateObservable();
  }
  get connectionState(): ConnectionState {
    return this.relay.state;
  }

  getErrorObservable(): Observable<ErrorPacket> {
    if (this.disposed) {
      throw new RxNostrAlreadyDisposedError();
    }

    return this.relay.getErrorObservable().pipe(
      map((reason) => ({
        from: this.url,
        reason,
      }))
    );
  }

  connectManually() {
    this.relay.connectManually();
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    this.relay.dispose();
    this.pubProxy.dispose();
    this.subProxy.dispose();
  }
}
