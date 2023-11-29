import Nostr from "nostr-typedef";
import {
  BehaviorSubject,
  combineLatest,
  distinctUntilChanged,
  EMPTY,
  filter,
  map,
  Observable,
  of,
  type OperatorFunction,
  retry,
  Subject,
  Subscription,
  timer,
} from "rxjs";

import type { RetryConfig, RxNostrConfig } from "./config.js";
import {
  RxNostrAlreadyDisposedError,
  RxNostrLogicError,
  RxNostrWebSocketError,
} from "./error.js";
import { evalFilters } from "./lazy-filter.js";
import { Nip11Registry } from "./nip11.js";
import { verify } from "./nostr/event.js";
import { isFiltered } from "./nostr/filter.js";
import {
  ConnectionState,
  ConnectionStatePacket,
  ErrorPacket,
  LazyREQ,
  MessagePacket,
} from "./packet.js";
import { defineDefault, normalizeRelayUrl } from "./util.js";

export interface SubscribeOptions {
  overwrite: boolean;
  autoclose: boolean;
  mode: REQMode;
}
export type REQMode = "weak" | "ondemand";

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
  private keepWeakSubs = false;
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
          this.relay.disconnect();
        }
      });
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
    this.relay.connect();
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

class PublishProxy {
  private pubs: Set<string> = new Set();
  private count$ = new CounterSubject(0);
  private disposed = false;

  constructor(private relay: RelayConnection) {
    // Recovering
    this.relay.getReconnectedObservable().subscribe((toRelayMessage) => {
      for (const [type, event] of toRelayMessage) {
        if (type !== "EVENT") {
          continue;
        }

        if (this.pubs.has(event.id)) {
          this.sendEVENT(event);
        }
      }
    });
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
  private queue: SubQueue;

  constructor(private relay: RelayConnection, private config: RxNostrConfig) {
    this.queue = new SubQueue(relay.url, config);

    // Dequeuing
    this.queue.getActivationObservable().subscribe((activated) => {
      for (const { req } of activated) {
        this.sendREQ(req);
      }
    });

    // Recovering
    this.relay.getReconnectedObservable().subscribe(() => {
      for (const { req } of this.queue.ongoings) {
        this.sendREQ(req);
      }
    });

    // Auto closing
    this.relay.getEOSEObservable().subscribe(([, subId]) => {
      if (this.subs.get(subId)?.autoclose) {
        this.unsubscribe(subId);
      }
    });
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

  getEventObservable(): Observable<Nostr.ToClientMessage.EVENT> {
    return this.relay.getEVENTObservable().pipe(
      filter(([, subId, event]) => {
        const filters = this.subs.get(subId)?.filters;
        if (!filters) {
          return false;
        }

        return (
          (this.config.skipValidateFilterMatching ||
            isFiltered(event, filters)) &&
          (this.config.skipVerify || verify(event))
        );
      })
    );
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
  private reconnected$ = new Subject<Nostr.ToRelayMessage.Any[]>();
  private message$ = new Subject<Nostr.ToClientMessage.Any>();
  private error$ = new Subject<unknown>();
  private retryTimer: Subscription | null = null;

  private disposed = false;

  private state$ = new Subject<ConnectionState>();
  private _state: ConnectionState = "initialized";
  get state(): ConnectionState {
    return this._state;
  }
  private setState(state: ConnectionState) {
    this._state = state;
    this.state$.next(state);
  }

  constructor(public url: string, private config: RxNostrConfig) {
    // Caching
    if (!config.skipFetchNip11) {
      Nip11Registry.fetch(url);
    }
  }

  connect(retryCount?: number) {
    if (this.state === "terminated") {
      return;
    }
    const isRetry = typeof retryCount === "number";

    const canConnect =
      this.state === "initialized" ||
      this.state === "closed" ||
      this.state === "error" ||
      this.state === "rejected" ||
      retry;
    if (!canConnect) {
      return;
    }

    if (isRetry) {
      this.setState("reconnecting");
    } else {
      this.setState("connecting");
    }

    this.socket = this.createSocket(retryCount ?? 0);
  }
  private createSocket(retryCount: number) {
    const onopen = () => {
      if (this.state === "terminated") {
        socket.close(WebSocketCloseCode.DISPOSED_BY_RX_NOSTR);
        return;
      }

      this.setState("connected");

      if (retryCount) {
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
        return;
      }

      try {
        this.message$.next(JSON.parse(data));
      } catch (err) {
        this.error$.next(err);
      }
    };
    const onclose = ({ code }: CloseEvent) => {
      socket.removeEventListener("open", onopen);
      socket.removeEventListener("message", onmessage);
      socket.removeEventListener("close", onclose);
      if (this.socket === socket) {
        this.socket = null;
      }

      if (
        this.state === "terminated" ||
        code === WebSocketCloseCode.DISPOSED_BY_RX_NOSTR
      ) {
        return;
      }

      if (code === WebSocketCloseCode.DESIRED_BY_RX_NOSTR) {
        // TODO: unsent と buffer に何か残っている場合は再送を試みる
        this.unsent = [];
        this.buffer = [];

        this.setState("closed");
      } else if (code === WebSocketCloseCode.DONT_RETRY) {
        this.unsent = [];
        this.buffer = [];

        this.setState("rejected");
        this.error$.next(new RxNostrWebSocketError(code));
      } else {
        const nextRetry = retryCount + 1;
        const shouldRetry =
          this.config.retry.strategy !== "off" &&
          nextRetry <= this.config.retry.maxCount;

        if (shouldRetry) {
          this.unsent.push(...this.buffer);
          this.buffer = [];

          this.setState("waiting-for-reconnection");

          this.retryTimer?.unsubscribe();
          this.retryTimer = retryTimer(this.config.retry, nextRetry).subscribe(
            () => {
              if (!this.disposed) {
                this.connect(nextRetry);
              }
            }
          );
        } else {
          this.unsent = [];
          this.buffer = [];

          this.setState("error");
        }

        this.error$.next(new RxNostrWebSocketError(code));
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

        if (this.socket.readyState === WebSocket.OPEN) {
          this.socket.send(JSON.stringify(message));
        } else {
          this.unsent.push(message);
        }
        return;
      }
      case "waiting-for-reconnection":
      case "reconnecting":
      case "error": {
        this.unsent.push(message);
        return;
      }
    }
  }

  getEVENTObservable(): Observable<Nostr.ToClientMessage.EVENT> {
    return this.message$.pipe(
      filter((msg): msg is Nostr.ToClientMessage.EVENT => msg[0] === "EVENT")
    );
  }
  getEOSEObservable(): Observable<Nostr.ToClientMessage.EOSE> {
    return this.message$.pipe(
      filter((msg): msg is Nostr.ToClientMessage.EOSE => msg[0] === "EOSE")
    );
  }
  getOKObservable(): Observable<Nostr.ToClientMessage.OK> {
    return this.message$.pipe(
      filter((msg): msg is Nostr.ToClientMessage.OK => msg[0] === "OK")
    );
  }
  getOtherObservable(): Observable<Nostr.ToClientMessage.Any> {
    return this.message$.pipe(
      filter(([type]) => type !== "EVENT" && type !== "EOSE" && type !== "OK")
    );
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
    this.setState("terminated");

    this.retryTimer?.unsubscribe();

    this.socket?.close(WebSocketCloseCode.DISPOSED_BY_RX_NOSTR);
    this.socket = null;

    const subjects = [
      this.state$,
      this.message$,
      this.error$,
      this.reconnected$,
    ];
    for (const sub of subjects) {
      sub.complete();
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

  constructor(private url: string, private config: RxNostrConfig) {}

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
    const nip11 = this.config.skipFetchNip11
      ? await Nip11Registry.getOrDefault(this.url)
      : await Nip11Registry.getOrFetch(this.url);
    return nip11.limitation?.max_subscriptions ?? Infinity;
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

interface SubRecord {
  subId: string;
  req: LazyREQ;
  filters?: Nostr.Filter[];
  autoclose: boolean;
}

function retryTimer(config: RetryConfig, count: number) {
  switch (config.strategy) {
    case "exponential": {
      const time = Math.max(
        config.initialDelay * 2 ** (count - 1) + (Math.random() - 0.5) * 1000,
        1000
      );
      return timer(time);
    }
    case "immediately":
      return of(0);
    case "linear":
      return timer(config.interval);
    case "off":
      return EMPTY;
  }
}
