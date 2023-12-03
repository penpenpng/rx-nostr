import Nostr from "nostr-typedef";
import { combineLatest, map, Observable, type OperatorFunction } from "rxjs";

import type { RxNostrConfig } from "../config.js";
import { RxNostrAlreadyDisposedError } from "../error.js";
import {
  ConnectionState,
  ConnectionStatePacket,
  ErrorPacket,
  LazyREQ,
  MessagePacket,
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
  private weakSubIds: Set<string> = new Set();
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
      for (const subId of this.weakSubIds) {
        this.subProxy.unsubscribe(subId);
      }
      this.weakSubIds.clear();
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
      this.weakSubIds.add(subId);
    }
    this.subProxy.subscribe(req, autoclose);
  }
  unsubscribe(subId: string): void {
    if (this.disposed) {
      return;
    }

    this.weakSubIds.delete(subId);
    this.subProxy.unsubscribe(subId);
  }

  getEventObservable(): Observable<MessagePacket<Nostr.ToClientMessage.EVENT>> {
    if (this.disposed) {
      throw new RxNostrAlreadyDisposedError();
    }

    return this.subProxy.getEventObservable().pipe(this.pack());
  }
  getEoseObservable(): Observable<MessagePacket<Nostr.ToClientMessage.EOSE>> {
    if (this.disposed) {
      throw new RxNostrAlreadyDisposedError();
    }

    return this.relay.getEOSEObservable().pipe(this.pack());
  }
  getOkObservable(): Observable<MessagePacket<Nostr.ToClientMessage.OK>> {
    if (this.disposed) {
      throw new RxNostrAlreadyDisposedError();
    }

    return this.relay.getOKObservable().pipe(this.pack());
  }
  getOtherObservable(): Observable<MessagePacket<Nostr.ToClientMessage.Any>> {
    if (this.disposed) {
      throw new RxNostrAlreadyDisposedError();
    }

    return this.relay.getOtherObservable().pipe(this.pack());
  }
  private pack<T extends Nostr.ToClientMessage.Any>(): OperatorFunction<
    T,
    MessagePacket<T>
  > {
    return map((message) => ({
      from: this.url,
      message,
    }));
  }

  getConnectionStateObservable(): Observable<ConnectionStatePacket> {
    if (this.disposed) {
      throw new RxNostrAlreadyDisposedError();
    }

    return this.relay.getConnectionStateObservable().pipe(
      map((state) => ({
        from: this.url,
        state,
      }))
    );
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
