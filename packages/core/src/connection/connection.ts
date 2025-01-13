import * as Nostr from "nostr-typedef";
import { combineLatest, map, Observable } from "rxjs";

import type {
  Authenticator,
  ConnectionStrategy,
  FilledRxNostrConfig,
} from "../config/index.js";
import { RxNostrAlreadyDisposedError } from "../error.js";
import {
  ConnectionState,
  ConnectionStatePacket,
  ErrorPacket,
  EventPacket,
  LazyREQ,
  MessagePacket,
  OkPacketAgainstEvent,
  OutgoingMessagePacket,
} from "../packet.js";
import { fill } from "../utils/config.js";
import { normalizeRelayUrl } from "../utils/normalize-url.js";
import { AuthProxy } from "./auth.js";
import { PublishProxy } from "./publish.js";
import { RelayConnection, WebSocketCloseCode } from "./relay.js";
import { FinPacket, SubscribeProxy } from "./subscribe.js";

export interface SubscribeOptions {
  overwrite: boolean;
  autoclose: boolean;
  mode: REQMode;
}

/**
 * - `"default"`: Subscriptions are active only while the relay is marked as a default relay.
 * - `"temporary"`: Subscriptions are always active.
 */
export type REQMode = "default" | "temporary";

export class NostrConnection {
  private relay: RelayConnection;
  private pubProxy: PublishProxy;
  private subProxy: SubscribeProxy;
  private defaultSubscriptionIds: Set<string> = new Set();
  private communicating = false;
  private strategy: ConnectionStrategy = "lazy";
  private disconnectTimeout: number;
  private disconnectTimer?: ReturnType<typeof setTimeout>;
  private isDefaultRelay = false;
  private disposed = false;
  private _url: string;

  get url() {
    return this._url;
  }

  constructor(url: string, config: FilledRxNostrConfig) {
    this._url = normalizeRelayUrl(url);
    const authenticator = getAuthenticator(url, config);

    const relay = new RelayConnection(this.url, config);
    const authProxy = authenticator
      ? new AuthProxy({ relay, config, authenticator })
      : null;
    const pubProxy = new PublishProxy({ relay, authProxy });
    const subProxy = new SubscribeProxy({ relay, authProxy, config });
    this.relay = relay;
    this.pubProxy = pubProxy;
    this.subProxy = subProxy;

    this.disconnectTimeout = config.disconnectTimeout;

    // Idling cold sockets
    combineLatest([
      this.pubProxy.getLogicalConnectionSizeObservable(),
      this.subProxy.getLogicalConnectionSizeObservable(),
    ])
      .pipe(map(([pubConns, subConns]) => pubConns + subConns))
      .subscribe((logicalConns) => {
        this.communicating = logicalConns > 0;
        this.resetConnection();
      });
  }

  setConnectionStrategy(strategy: ConnectionStrategy): void {
    if (this.disposed) {
      return;
    }

    this.strategy = strategy;
    this.resetConnection();
  }

  private resetConnection() {
    let strategy = this.strategy;
    if (!this.isDefaultRelay) {
      strategy = "lazy";
    }

    switch (strategy) {
      case "lazy": {
        // clear existing timer
        if (this.disconnectTimeout) {
          clearTimeout(this.disconnectTimer);
          this.disconnectTimer = undefined;
        }

        // create a new timer
        this.disconnectTimer = setTimeout(() => {
          if (!this.communicating) {
            this.relay.disconnect(WebSocketCloseCode.RX_NOSTR_IDLE);
          }
        }, this.disconnectTimeout);
        break;
      }
      case "lazy-keep": {
        break;
      }
      case "aggressive": {
        if (
          this.connectionState === "initialized" ||
          this.connectionState === "dormant"
        ) {
          this.relay.connectManually();
        }
        break;
      }
    }
  }

  markAsDefault(flag: boolean): void {
    if (this.disposed) {
      return;
    }

    this.isDefaultRelay = flag;

    if (!this.isDefaultRelay) {
      for (const subId of this.defaultSubscriptionIds) {
        this.subProxy.unsubscribe(subId);
      }
      this.defaultSubscriptionIds.clear();
    }

    this.resetConnection();
  }

  async publish(event: Nostr.Event<number>): Promise<void> {
    if (this.disposed) {
      return;
    }

    return this.pubProxy.publish(event);
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

    const { mode, overwrite, autoclose } = fill(options ?? {}, {
      overwrite: false,
      autoclose: false,
      mode: "default",
    });
    const [, subId] = req;

    if (mode === "default" && !this.isDefaultRelay) {
      return;
    }
    if (!overwrite && this.subProxy.isOngoingOrQueued(subId)) {
      return;
    }

    if (mode === "default") {
      this.defaultSubscriptionIds.add(subId);
    }
    this.subProxy.subscribe(req, autoclose);
  }
  unsubscribe(subId: string): void {
    if (this.disposed) {
      return;
    }

    this.defaultSubscriptionIds.delete(subId);
    this.subProxy.unsubscribe(subId);
  }

  getEventObservable(): Observable<EventPacket> {
    if (this.disposed) {
      throw new RxNostrAlreadyDisposedError();
    }

    return this.subProxy.getEventObservable();
  }
  getFinObservable(): Observable<FinPacket> {
    if (this.disposed) {
      throw new RxNostrAlreadyDisposedError();
    }

    return this.subProxy.getFinObservable();
  }
  getOkAgainstEventObservable(): Observable<OkPacketAgainstEvent> {
    if (this.disposed) {
      throw new RxNostrAlreadyDisposedError();
    }

    return this.pubProxy.getOkAgainstEventObservable();
  }
  getAllMessageObservable(): Observable<MessagePacket> {
    if (this.disposed) {
      throw new RxNostrAlreadyDisposedError();
    }

    return this.relay.getAllMessageObservable();
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
      })),
    );
  }

  connectManually() {
    this.relay.connectManually();
  }

  dispose() {
    this[Symbol.dispose]();
  }

  [Symbol.dispose](): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
    this.disconnectTimer = undefined;

    this.relay.dispose();
    this.pubProxy.dispose();
    this.subProxy.dispose();
  }
}

function getAuthenticator(
  url: string,
  config: FilledRxNostrConfig,
): Authenticator | undefined {
  const a = config.authenticator;
  if (!a) {
    return;
  }

  const c = a instanceof Function ? a(url) : a;
  return c === "auto" ? {} : c;
}
