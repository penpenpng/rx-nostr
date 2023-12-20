import Nostr from "nostr-typedef";
import { combineLatest, map, Observable } from "rxjs";

import type { Authenticator, RxNostrConfig } from "../config/index.js";
import { RxNostrAlreadyDisposedError } from "../error.js";
import {
  AuthState,
  AuthStatePacket,
  ConnectionState,
  ConnectionStatePacket,
  ErrorPacket,
  EventPacket,
  LazyREQ,
  MessagePacket,
  OkPacketAgainstEvent,
  OutgoingMessagePacket,
} from "../packet.js";
import { defineDefault, normalizeRelayUrl } from "../utils.js";
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
  private authProxy: AuthProxy | null;
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
    const authenticator = getAuthenticator(url, config);

    const relay = new RelayConnection(this.url, config);
    const authProxy = authenticator
      ? new AuthProxy({ relay, config, authenticator })
      : null;
    const pubProxy = new PublishProxy({ relay, authProxy });
    const subProxy = new SubscribeProxy({ relay, authProxy, config });
    this.relay = relay;
    this.authProxy = authProxy;
    this.pubProxy = pubProxy;
    this.subProxy = subProxy;

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

  getAuthStateObservable(): Observable<AuthStatePacket> | undefined {
    return this.authProxy?.getAuthStateObservable();
  }
  get authState(): AuthState | undefined {
    return this.authProxy?.state;
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

function getAuthenticator(
  url: string,
  config: RxNostrConfig
): Authenticator | undefined {
  const a = config.authenticator;
  if (!a) {
    return;
  }
  if ("strategy" in a) {
    return a;
  }
  return a(url);
}
