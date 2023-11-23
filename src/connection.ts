import Nostr from "nostr-typedef";
import {
  BehaviorSubject,
  combineLatest,
  distinctUntilChanged,
  EMPTY,
  filter,
  identity,
  map,
  merge,
  mergeMap,
  type MonoTypeOperatorFunction,
  Observable,
  type ObservableInput,
  of,
  type OperatorFunction,
  retry,
  Subject,
  tap,
  timer,
  type Unsubscribable,
} from "rxjs";

import {
  RxNostrAlreadyDisposedError,
  RxNostrLogicError,
  RxNostrWebSocketError,
} from "./error.js";
import { evalFilters } from "./lazy-filter.js";
import { isFiltered } from "./nostr/filter.js";
import { fetchRelayInfo } from "./nostr/nip11.js";
import {
  ConnectionState,
  ConnectionStatePacket,
  ErrorPacket,
  LazyREQ,
  MessagePacket,
} from "./packet.js";
import { defineDefaultOptions, normalizeRelayUrl } from "./util.js";

export interface SubscribeOptions {
  overwrite: boolean;
  autoclose: boolean;
  mode: REQMode;
}
export type REQMode = "weak" | "ondemand";

const makeSubscribeOptions = defineDefaultOptions<SubscribeOptions>({
  overwrite: false,
  autoclose: false,
  mode: "weak",
});

export class NostrConnection {
  private url: string;
  private relay: RelayConnection;
  private pubProxy: PublishProxy;
  private subProxy: SubscribeProxy;
  private weakSubIds: Set<string> = new Set();
  private logicalConns = 0;
  private keepAlive = false;
  private keepWeakSubs = false;
  private disposed = false;
  private toBeUnsubscribed: Unsubscribable[] = [];

  constructor(url: string, config: ConnectionConfig) {
    this.url = normalizeRelayUrl(url);
    this.relay = new RelayConnection(this.url, config);
    this.pubProxy = new PublishProxy(this.relay);
    this.subProxy = new SubscribeProxy(this.relay);

    const idlingColdSocket = combineLatest([
      this.pubProxy.getLogicalConnectionSizeObservable(),
      this.subProxy.getLogicalConnectionSizeObservable(),
    ])
      .pipe(map(([pubConns, subConns]) => pubConns + subConns))
      .subscribe((logicalConns) => {
        this.logicalConns = logicalConns;

        if (!this.keepAlive && this.logicalConns <= 0) {
          this.relay.disconnect();
        }
      });
    this.toBeUnsubscribed.push(idlingColdSocket);
  }

  setKeepAlive(flag: boolean): void {
    if (this.disposed) {
      return;
    }

    this.keepAlive = flag;

    if (!this.keepAlive && this.logicalConns <= 0) {
      this.relay.disconnect();
    }
  }

  setKeepWeakSubs(flag: boolean): void {
    if (this.disposed) {
      return;
    }

    this.keepWeakSubs = flag;

    if (!this.keepWeakSubs) {
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

  getMessageObservable(): Observable<MessagePacket> {
    if (this.disposed) {
      throw new RxNostrAlreadyDisposedError();
    }

    return merge(
      this.subProxy.getEventObservable(),
      this.relay
        .getMessageObservable()
        .pipe(filter((message) => message[0] !== "EVENT"))
    ).pipe(
      map((message) => ({
        from: this.url,
        message,
      }))
    );
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

  dispose() {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    this.relay.dispose();
    this.pubProxy.dispose();
    this.subProxy.dispose();

    for (const sub of this.toBeUnsubscribed) {
      sub.unsubscribe();
    }
  }
}

class PublishProxy {
  private pubs: Set<string> = new Set();
  private count$ = new CounterSubject(0);
  private disposed = false;
  private toBeUnsubscribed: Unsubscribable[] = [];

  constructor(private relay: RelayConnection) {
    const recovering = this.relay
      .getReconnectedObservable()
      .subscribe((toRelayMessage) => {
        for (const [type, event] of toRelayMessage) {
          if (type !== "EVENT") {
            continue;
          }

          if (this.pubs.has(event.id)) {
            this.sendEVENT(event);
          }
        }
      });

    this.toBeUnsubscribed.push(recovering);
  }

  publish(event: Nostr.Event<number>): void {
    if (this.disposed) {
      return;
    }

    if (!this.pubs.has(event.id)) {
      this.pubs.add(event.id);
      this.count$.increment();
    }

    this.sendEVENT(event);
  }

  confirmOK(eventId: string): void {
    if (this.disposed) {
      return;
    }

    if (!this.pubs.has(eventId)) {
      this.pubs.delete(eventId);
      this.count$.decrement();
    }
  }

  getLogicalConnectionSizeObservable(): Observable<number> {
    return this.count$.asObservable();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    this.count$.complete();
    this.count$.unsubscribe();

    for (const sub of this.toBeUnsubscribed) {
      sub.unsubscribe();
    }
  }

  private sendEVENT(event: Nostr.Event) {
    this.relay.send(["EVENT", event]);
  }
}

class SubscribeProxy {
  // maxSubscriptions: number | null = undefined;
  // maxFilters: number | null;
  // maxLimit: number | null;
  private subs = new Map<string, SubRecord>();
  private disposed = false;
  private toBeUnsubscribed: Unsubscribable[] = [];
  private queue: SubQueue;

  constructor(private relay: RelayConnection) {
    this.queue = new SubQueue(relay.url);

    const dequeuing = this.queue
      .getActivationObservable()
      .subscribe((activated) => {
        for (const { req } of activated) {
          this.sendREQ(req);
        }
      });
    const recovering = this.relay.getReconnectedObservable().subscribe(() => {
      for (const { req } of this.queue.ongoings) {
        this.sendREQ(req);
      }
    });
    const autoClosing = this.relay
      .getMessageObservable()
      .pipe(
        filter((msg): msg is Nostr.ToClientMessage.EOSE => msg[0] === "EOSE"),
        map((msg) => msg[1])
      )
      .subscribe((subId) => {
        if (this.subs.get(subId)?.autoclose) {
          this.unsubscribe(subId);
        }
      });

    this.toBeUnsubscribed.push(dequeuing);
    this.toBeUnsubscribed.push(recovering);
    this.toBeUnsubscribed.push(autoClosing);
  }

  subscribe(req: LazyREQ, autoclose: boolean): void {
    if (this.disposed) {
      return;
    }

    const subId = req[1];
    const sub: SubRecord = {
      subId,
      req,
      autoclose,
    };

    this.subs.set(subId, sub);
    this.queue.enqueue(sub);
  }

  unsubscribe(subId: string): void {
    if (this.disposed) {
      return;
    }

    this.sendCLOSE(subId);
    this.subs.delete(subId);
    this.queue.drop(subId);
  }

  isOngoingOrQueued(subId: string): boolean {
    return this.queue.has(subId);
  }

  getLogicalConnectionSizeObservable(): Observable<number> {
    return this.queue.getSizeObservable();
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    this.queue.dispose();

    for (const sub of this.toBeUnsubscribed) {
      sub.unsubscribe();
    }
  }

  getEventObservable(): Observable<Nostr.ToClientMessage.EVENT> {
    return this.relay.getMessageObservable().pipe(
      filter((msg): msg is Nostr.ToClientMessage.EVENT => msg[0] === "EVENT"),
      filter(([, subId, event]) => {
        const filters = this.subs.get(subId)?.filters;
        if (!filters) {
          return false;
        }

        return isFiltered(event, filters);
      })
    );
  }

  private sendREQ([, subId, ...lazyFilters]: LazyREQ) {
    const filters = evalFilters(lazyFilters);
    const sub = this.subs.get(subId);
    if (!sub) {
      return;
    }

    sub.filters = filters;
    this.relay.send(["REQ", subId, ...filters]);
  }
  private sendCLOSE(subId: string) {
    this.relay.send(["CLOSE", subId]);
  }
}

class RelayConnection {
  private socket: WebSocket | null = null;
  private buffer: Nostr.ToRelayMessage.Any[] = [];
  private unsent: Nostr.ToRelayMessage.Any[] = [];
  private state$ = new BehaviorSubject<ConnectionState>("initialized");
  private incoming$ = new Subject<
    Nostr.ToClientMessage.Any | RxNostrWebSocketError
  >();
  private reconnected$ = new Subject<Nostr.ToRelayMessage.Any[]>();
  private message$ = new Subject<Nostr.ToClientMessage.Any>();
  private error$ = new Subject<unknown>();

  private toBeUnsubscribed: Unsubscribable[] = [];
  private disposed = false;

  constructor(public url: string, private config: ConnectionConfig) {
    // Caching
    Nip11Registry.get(url);

    const recovering = this.incoming$
      .pipe(
        rethrowWebSocketError(),
        backoff(this.config.backoff),
        tap({
          error: () => {
            this.state$.next("error");
          },
        })
      )
      .subscribe(this.message$);
    this.toBeUnsubscribed.push(recovering);

    function backoff<T>(config: BackoffConfig): MonoTypeOperatorFunction<T> {
      return config.strategy === "off"
        ? identity
        : retry({
            delay: (_, retryCount) => backoffSignal(config, retryCount),
            count: config.maxCount,
          });
    }
    function rethrowWebSocketError(): OperatorFunction<
      Nostr.ToClientMessage.Any | RxNostrWebSocketError,
      Nostr.ToClientMessage.Any
    > {
      return mergeMap((event) => {
        if (event instanceof RxNostrWebSocketError) {
          throw event;
        } else {
          return of(event);
        }
      });
    }
  }

  get state() {
    return this.state$.getValue();
  }

  connect(reconnect = false) {
    if (this.state === "terminated") {
      return;
    }

    const canConnect =
      this.state === "initialized" ||
      this.state === "closed" ||
      this.state === "error" ||
      this.state === "rejected" ||
      reconnect;
    if (!canConnect) {
      return;
    }

    if (reconnect) {
      this.state$.next("reconnecting");
    } else {
      this.state$.next("connecting");
    }

    this.socket = this.createSocket(reconnect);
  }

  private createSocket(reconnect: boolean) {
    const onopen = () => {
      if (this.state === "terminated") {
        socket.close(WebSocketCloseCode.DISPOSED_BY_RX_NOSTR);
        return;
      }

      this.state$.next("connected");

      if (reconnect) {
        this.reconnected$.next(this.unsent);
        this.unsent = [];
      }

      try {
        for (const message of this.buffer) {
          this.send(message);
        }
      } catch (err) {
        this.error$.next(err);
      } finally {
        this.buffer = [];
      }
    };
    const onmessage = ({ data }: MessageEvent) => {
      if (this.state === "terminated") {
        socket.close(WebSocketCloseCode.DISPOSED_BY_RX_NOSTR);
        return;
      }

      try {
        this.incoming$.next(JSON.parse(data));
      } catch (err) {
        this.error$.next(err);
      }
    };
    const onclose = ({ code }: CloseEvent) => {
      if (
        this.state === "terminated" ||
        code === WebSocketCloseCode.DISPOSED_BY_RX_NOSTR
      ) {
        return;
      }

      socket.removeEventListener("open", onopen);
      socket.removeEventListener("message", onmessage);
      socket.removeEventListener("close", onclose);
      socket.close();
      this.socket = null;

      if (code === WebSocketCloseCode.DESIRED_BY_RX_NOSTR) {
        this.unsent = [];
        this.buffer = [];

        this.state$.next("closed");
      } else if (code === WebSocketCloseCode.DONT_RETRY) {
        this.unsent = [];
        this.buffer = [];

        this.state$.next("rejected");
        this.error$.next(new RxNostrWebSocketError(code));
      } else {
        this.unsent.push(...this.buffer);
        this.buffer = [];

        // Don't `this.incoming$.error()` because we will never be able to call `.next()`
        this.incoming$.next(new RxNostrWebSocketError(code));
      }
    };

    const socket = new WebSocket(this.url);

    socket.addEventListener("open", onopen);
    socket.addEventListener("message", onmessage);
    socket.addEventListener("close", onclose);

    return socket;
  }

  disconnect(): void {
    this.socket?.close(WebSocketCloseCode.DESIRED_BY_RX_NOSTR);
  }

  send(message: Nostr.ToRelayMessage.Any): void {
    switch (this.state) {
      case "terminated":
      case "rejected": {
        return;
      }
      case "initialized":
      case "connecting":
      case "closed": {
        this.buffer.push(message);
        this.connect();
        return;
      }
      case "connected": {
        if (!this.socket) {
          throw new RxNostrLogicError();
        }

        this.socket.send(JSON.stringify(message));
        return;
      }
      case "reconnecting":
      case "error": {
        this.unsent.push(message);
        return;
      }
    }
  }

  getMessageObservable(): Observable<Nostr.ToClientMessage.Any> {
    return this.message$.asObservable();
  }

  getReconnectedObservable(): Observable<Nostr.ToRelayMessage.Any[]> {
    return this.reconnected$.asObservable();
  }

  getConnectionStateObservable(): Observable<ConnectionState> {
    return this.state$.pipe(distinctUntilChanged());
  }

  getErrorObservable(): Observable<unknown> {
    return this.error$.asObservable();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    const subjects = [
      this.state$,
      this.incoming$,
      this.message$,
      this.error$,
      this.reconnected$,
    ];
    for (const sub of subjects) {
      sub.complete();
      sub.unsubscribe();
    }

    for (const sub of this.toBeUnsubscribed) {
      sub.unsubscribe();
    }
  }
}

class CounterSubject extends BehaviorSubject<number> {
  constructor(count?: number) {
    super(count ?? 0);
  }
  increment() {
    this.next(this.getValue() + 1);
  }
  decrement() {
    this.next(this.getValue() - 1);
  }
  next(x: ((v: number) => number) | number) {
    if (typeof x === "number") {
      super.next(x);
    } else {
      super.next(x(this.getValue()));
    }
  }
}

class SubQueue {
  private _queuings: SubRecord[] = [];
  private _ongoings: SubRecord[] = [];
  private activated$ = new Subject<SubRecord[]>();
  private count$ = new CounterSubject();

  get queuings(): SubRecord[] {
    return this._queuings;
  }
  private set queuings(v: SubRecord[]) {
    this._queuings = v;
  }
  get ongoings(): SubRecord[] {
    return this._ongoings;
  }
  private set ongoings(v: SubRecord[]) {
    this._ongoings = v;
  }

  constructor(private url: string) {}

  enqueue(v: SubRecord): void {
    this.queuings = [...this.queuings, v];
    this.count$.increment();

    this.shift();
  }
  drop(subId: string): void {
    const remove = (arr: SubRecord[], subId: string): [SubRecord[], number] => {
      const prevLength = arr.length;
      const filtered = arr.filter((e) => e.subId !== subId);
      const removed = prevLength - filtered.length;

      return [filtered, removed];
    };

    const [queuings, droppedX] = remove(this.queuings, subId);
    const [ongoings, droppedY] = remove(this.ongoings, subId);
    this.queuings = queuings;
    this.ongoings = ongoings;
    this.count$.next((v) => v - (droppedX + droppedY));

    this.shift();
  }
  has(subId: string) {
    return (
      !!this.ongoings.find((e) => e.subId === subId) ||
      !!this.queuings.find((e) => e.subId === subId)
    );
  }
  getActivationObservable() {
    return this.activated$.asObservable();
  }
  getSizeObservable() {
    return this.count$.asObservable();
  }

  dispose() {
    const subjects = [this.activated$, this.count$];
    for (const sub of subjects) {
      sub.complete();
      sub.unsubscribe();
    }
  }

  private async shift() {
    const capacity = await this.capacity();

    const concated = [...this.ongoings, ...this.queuings];
    const ongoings = concated.slice(0, capacity);
    const queuings = concated.slice(capacity);
    const activated = this.queuings.slice(0, capacity - this.ongoings.length);

    this.ongoings = ongoings;
    this.queuings = queuings;

    if (activated.length > 0) {
      this.activated$.next(activated);
    }
  }

  private async capacity() {
    const nip11 = await Nip11Registry.get(this.url);
    return nip11.limitation?.max_subscriptions ?? Infinity;
  }
}

export class Nip11Registry {
  private static cache: Record<string, Promise<Nostr.Nip11.RelayInfo>> = {};

  static async get(url: string): Promise<Nostr.Nip11.RelayInfo> {
    url = normalizeRelayUrl(url);

    return this.cache[url] ?? this.fetch(url);
  }

  static set(url: string, nip11: Nostr.Nip11.RelayInfo) {
    url = normalizeRelayUrl(url);

    this.cache[url] = Promise.resolve(nip11);
  }

  static async fetch(url: string) {
    url = normalizeRelayUrl(url);

    this.cache[url] = fetchRelayInfo(url);
    return this.cache[url];
  }
}

export const WebSocketCloseCode = {
  /**
   * 1006 is a reserved value and MUST NOT be set as a status code in a
   * Close control frame by an endpoint.  It is designated for use in
   * applications expecting a status code to indicate that the
   * connection was closed abnormally, e.g., without sending or
   * receiving a Close control frame.
   *
   * See also: https://www.rfc-editor.org/rfc/rfc6455.html#section-7.4.1
   */
  ABNORMAL_CLOSURE: 1006,
  /**
   * When a websocket is closed by the relay with a status code 4000
   * that means the client shouldn't try to connect again.
   *
   * See also: https://github.com/nostr-protocol/nips/blob/fab6a21a779460f696f11169ddf343b437327592/01.md?plain=1#L113
   */
  DONT_RETRY: 4000,
  /** @internal rx-nostr uses it internally. */
  DESIRED_BY_RX_NOSTR: 4537,
  /** @internal rx-nostr uses it internally. */
  DISPOSED_BY_RX_NOSTR: 4538,
} as const;

export interface ConnectionConfig {
  backoff: BackoffConfig;
}

export type BackoffConfig =
  | {
      // Exponential backoff and jitter strategy
      strategy: "exponential";
      maxCount: number;
      initialDelay: number;
    }
  | {
      // Retry at regular intervals
      strategy: "linear";
      maxCount: number;
      interval: number;
    }
  | {
      // Retry immediately
      strategy: "immediately";
      maxCount: number;
    }
  | {
      // Won't retry
      strategy: "off";
    };

interface SubRecord {
  subId: string;
  req: LazyREQ;
  filters?: Nostr.Filter[];
  autoclose: boolean;
}

function backoffSignal(
  config: BackoffConfig,
  count: number
): ObservableInput<unknown> {
  if (config.strategy === "exponential") {
    const time = Math.max(
      config.initialDelay * 2 ** (count - 1) + (Math.random() - 0.5) * 1000,
      1000
    );
    return timer(time);
  } else if (config.strategy === "linear") {
    return timer(config.interval);
  } else if (config.strategy === "immediately") {
    return of(0);
  } else {
    return EMPTY;
  }
}
