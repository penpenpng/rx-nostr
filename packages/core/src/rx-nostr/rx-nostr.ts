import * as Nostr from "nostr-typedef";
import {
  filter,
  finalize,
  first,
  map,
  merge,
  mergeAll,
  Observable,
  Subject,
  switchAll,
  takeUntil,
  takeWhile,
  tap,
  timeout,
} from "rxjs";

import {
  type EventSigner,
  makeRxNostrConfig,
  type RxNostrConfig,
} from "../config/index.js";
import { NostrConnection, type REQMode } from "../connection/index.js";
import { FinPacket } from "../connection/index.js";
import {
  RxNostrAlreadyDisposedError,
  RxNostrInvalidUsageError,
  RxNostrLogicError,
} from "../error.js";
import { completeOnTimeout, filterBySubId } from "../operator.js";
import type {
  ConnectionState,
  ConnectionStatePacket,
  ErrorPacket,
  EventPacket,
  LazyREQ,
  MessagePacket,
  OkPacketAgainstEvent,
  OutgoingMessagePacket,
  ReqPacket,
} from "../packet.js";
import { subtract } from "../utils/array-operation.js";
import { UrlMap } from "../utils/url-map.js";
import {
  type AcceptableDefaultRelaysConfig,
  type DefaultRelayConfig,
  makeRxNostrSendOptions,
  makeRxNostrUseOptions,
  RelayStatus,
  type RxNostr,
  type RxNostrSendOptions,
  type RxNostrUseOptions,
} from "./interface.js";
import type { RxReq } from "./rx-req.js";
import { makeLazyREQ, normalizeRelaysConfig } from "./utils.js";

/** Create a RxNostr object. This is the only way to create that. */
export function createRxNostr(config?: Partial<RxNostrConfig>): RxNostr {
  return new RxNostrImpl(makeRxNostrConfig(config));
}

class RxNostrImpl implements RxNostr {
  private connections = new UrlMap<NostrConnection>();
  private defaultRelays = new UrlMap<DefaultRelayConfig>();
  private get defaultReadables(): NostrConnection[] {
    const conns: NostrConnection[] = [];
    for (const { url, read } of this.defaultRelays.values()) {
      const conn = this.connections.get(url);
      if (read && conn) {
        conns.push(conn);
      }
    }
    return conns;
  }
  private get defaultWritables(): NostrConnection[] {
    const conns: NostrConnection[] = [];
    for (const { url, write } of this.defaultRelays.values()) {
      const conn = this.connections.get(url);
      if (write && conn) {
        conns.push(conn);
      }
    }
    return conns;
  }
  private defaultSubscriptions: Map<
    string,
    { req: LazyREQ; autoclose: boolean }
  > = new Map();

  private event$ = new Subject<EventPacket>();
  private fin$ = new Subject<FinPacket>();
  private ok$ = new Subject<OkPacketAgainstEvent>();
  private all$ = new Subject<MessagePacket>();

  private error$ = new Subject<ErrorPacket>();
  private connectionState$ = new Subject<ConnectionStatePacket>();
  private outgoing$ = new Subject<OutgoingMessagePacket>();

  private dispose$ = new Subject<void>();
  private disposed = false;

  constructor(private config: RxNostrConfig) {}

  // #region defaultRelays getter/setter
  getDefaultRelays(): Record<string, DefaultRelayConfig> {
    if (this.disposed) {
      throw new RxNostrAlreadyDisposedError();
    }

    return this.defaultRelays.toObject();
  }
  getDefaultRelay(url: string): DefaultRelayConfig | undefined {
    return this.defaultRelays.get(url);
  }

  setDefaultRelays(relays: AcceptableDefaultRelaysConfig): void {
    if (this.disposed) {
      throw new RxNostrAlreadyDisposedError();
    }

    const nextDefaultRelays = new UrlMap(normalizeRelaysConfig(relays));
    const nextReadableConnections: NostrConnection[] = [];

    for (const { read, url } of nextDefaultRelays.values()) {
      const conn = this.ensureNostrConnection(url);
      conn.setConnectionStrategy(this.config.connectionStrategy);

      if (read) {
        nextReadableConnections.push(conn);
      }
    }

    this.updateDefaultSubscriptions(nextReadableConnections);

    this.defaultRelays = nextDefaultRelays;
  }
  private ensureNostrConnection(url: string): NostrConnection {
    let conn = this.connections.get(url);

    if (conn) {
      return conn;
    }

    conn = new NostrConnection(url, this.config);

    this.attachNostrConnection(conn);
    this.connections.set(url, conn);

    return conn;
  }
  private attachNostrConnection(conn: NostrConnection): void {
    conn.getEventObservable().subscribe(this.event$);
    conn.getFinObservable().subscribe(this.fin$);
    conn.getOkAgainstEventObservable().subscribe(this.ok$);
    conn.getAllMessageObservable().subscribe(this.all$);
    conn.getConnectionStateObservable().subscribe(this.connectionState$);
    conn.getErrorObservable().subscribe(this.error$);
    conn.getOutgoingMessageObservable().subscribe(this.outgoing$);
  }
  private updateDefaultSubscriptions(
    nextReadableConnections: NostrConnection[],
  ): void {
    const noLongerNeededConnections = subtract(
      this.defaultReadables,
      nextReadableConnections,
    );

    for (const conn of noLongerNeededConnections) {
      conn.markAsDefault(false);
    }
    for (const conn of nextReadableConnections) {
      conn.markAsDefault(true);
      for (const { req, autoclose } of this.defaultSubscriptions.values()) {
        conn?.subscribe(req, {
          mode: "default",
          overwrite: false,
          autoclose,
        });
      }
    }
  }
  addDefaultRelays(relays: AcceptableDefaultRelaysConfig): void {
    const additionalDefaultRelays = normalizeRelaysConfig(relays);

    this.setDefaultRelays({
      ...this.defaultRelays.toObject(),
      ...additionalDefaultRelays,
    });
  }
  removeDefaultRelays(urls: string | string[]): void {
    const defaultRelays = this.defaultRelays.copy();
    const targets = Array.isArray(urls) ? urls : [urls];
    for (const url of targets) {
      defaultRelays.delete(url);
    }

    this.setDefaultRelays(defaultRelays.toObject());
  }
  // #endregion

  // #region connection state getter
  getAllRelayStatus(): Record<string, RelayStatus> {
    return Object.fromEntries(
      Array.from(this.connections.values()).map((e) => [
        e.url,
        { connection: e.connectionState },
      ]),
    );
  }
  getRelayStatus(url: string): RelayStatus | undefined {
    const conn = this.connections.get(url);
    if (!conn) {
      return undefined;
    }

    return { connection: conn.connectionState };
  }
  // #endregion

  reconnect(url: string): void {
    const relay = this.getDefaultRelay(url);
    if (!relay) {
      throw new RxNostrInvalidUsageError(
        `The relay (${url}) is not a default relay. \`reconnect()\` can be used only for a readable default relay.`,
      );
    }
    if (!relay.read) {
      throw new RxNostrInvalidUsageError(
        `The relay (${url}) is not readable. \`reconnect()\` can be used only for a readable default relay.`,
      );
    }

    const conn = this.connections.get(url);
    if (!conn) {
      throw new RxNostrLogicError();
    }
    if (
      conn.connectionState === "error" ||
      conn.connectionState === "rejected"
    ) {
      conn.connectManually();
    }
  }

  // #region use
  use(
    rxReq: RxReq,
    options?: Partial<RxNostrUseOptions>,
  ): Observable<EventPacket> {
    const { relays: useScopeRelays } = makeRxNostrUseOptions(options);

    interface OrderPacket {
      subId: string;
      req: LazyREQ;
      targetConnections: NostrConnection[];
      mode: REQMode;
    }

    const makeOrderPacket = (
      { filters, relays }: ReqPacket,
      index: number,
    ): OrderPacket => {
      const emitScopeRelays =
        rxReq.strategy === "backward" ? relays : undefined;
      const req = makeLazyREQ({ rxReq, filters, index });
      const subId = req[1];

      return {
        subId,
        req,
        targetConnections:
          (emitScopeRelays ?? useScopeRelays)?.map((url) =>
            this.ensureNostrConnection(url),
          ) ?? this.defaultReadables,
        mode:
          emitScopeRelays === undefined && useScopeRelays === undefined
            ? "default"
            : "temporary",
      };
    };
    const startSubscription = ({
      req,
      targetConnections,
      mode,
    }: OrderPacket) => {
      this.startSubscription({
        req,
        targetConnections,
        mode,
        overwrite: rxReq.strategy === "forward",
        autoclose: rxReq.strategy === "backward",
      });
    };
    const teardownSubscription = ({
      subId,
      targetConnections,
      mode,
    }: OrderPacket) => {
      this.teardownSubscription({
        subId,
        targetConnections,
        mode,
      });
    };
    const createEventObservable = ({ req, targetConnections }: OrderPacket) => {
      if (rxReq.strategy === "forward") {
        return this.createForwardEventObservable({
          req,
        }).pipe(takeUntil(this.dispose$));
      } else {
        return this.createBackwardEventObservable({
          req,
          targetConnections,
        }).pipe(takeUntil(this.dispose$));
      }
    };

    const order$ = rxReq.getReqPacketObservable().pipe(
      filter(({ filters }) => filters.length > 0),
      map(makeOrderPacket),
      takeUntil(this.dispose$),
    );

    if (rxReq.strategy === "forward") {
      let firstOrder: OrderPacket | undefined;

      return order$.pipe(
        tap((order) => {
          firstOrder = order;
        }),
        tap(startSubscription),
        map(createEventObservable),
        finalize(() => {
          if (!firstOrder) {
            return;
          }
          // Because subId, targetConnections and mode keeps their value under forward strategy
          teardownSubscription(firstOrder);
        }),
        switchAll(),
      );
    } else {
      return order$.pipe(
        tap(startSubscription),
        map((order) =>
          createEventObservable(order).pipe(
            finalize(() => {
              teardownSubscription(order);
            }),
          ),
        ),
        mergeAll(),
      );
    }
  }
  private createForwardEventObservable(params: {
    req: LazyREQ;
  }): Observable<EventPacket> {
    const { req } = params;
    const subId = req[1];

    return this.event$.pipe(filterBySubId(subId));
  }
  private createBackwardEventObservable(params: {
    req: LazyREQ;
    targetConnections: NostrConnection[];
  }): Observable<EventPacket> {
    const { req, targetConnections } = params;
    const subId = req[1];
    const finishedRelays = new Set<string>();

    const isDown = (state: ConnectionState): boolean =>
      state === "error" || state === "rejected" || state === "terminated";
    const shouldComplete = () =>
      targetConnections.every(
        ({ connectionState, url }) =>
          isDown(connectionState) || finishedRelays.has(url),
      );

    const fin$ = this.fin$.pipe(
      filterBySubId(subId),
      tap(({ from }) => {
        finishedRelays.add(from);
      }),
    );
    const complete$ = merge(fin$, this.connectionState$.asObservable()).pipe(
      filter(() => shouldComplete()),
      first(),
    );

    return this.event$.pipe(
      takeUntil(complete$),
      completeOnTimeout(this.config.eoseTimeout),
      filterBySubId(subId),
      filter((e) => !finishedRelays.has(e.from)),
    );
  }
  private startSubscription(params: {
    req: LazyREQ;
    targetConnections: NostrConnection[];
    mode: REQMode;
    overwrite: boolean;
    autoclose: boolean;
  }) {
    const { req, targetConnections, mode, overwrite, autoclose } = params;
    const subId = req[1];

    if (mode === "default") {
      this.defaultSubscriptions.set(subId, { req, autoclose });
    }
    for (const conn of targetConnections) {
      conn.subscribe(req, {
        mode,
        overwrite,
        autoclose,
      });
    }
  }
  private teardownSubscription(params: {
    subId: string;
    targetConnections: NostrConnection[];
    mode: REQMode;
  }): void {
    const { subId, targetConnections, mode } = params;

    if (mode === "default") {
      this.defaultSubscriptions.delete(subId);
    }
    for (const conn of targetConnections) {
      conn.unsubscribe(subId);
    }
  }
  // #endregion use

  // #region createObservable
  createAllEventObservable(): Observable<EventPacket> {
    return this.event$.asObservable();
  }
  createAllErrorObservable(): Observable<ErrorPacket> {
    return this.error$.asObservable();
  }
  createAllMessageObservable(): Observable<MessagePacket> {
    return this.all$.asObservable();
  }
  createConnectionStateObservable(): Observable<ConnectionStatePacket> {
    return this.connectionState$.asObservable();
  }
  createOutgoingMessageObservable(): Observable<OutgoingMessagePacket> {
    return this.outgoing$.asObservable();
  }
  // #endregion

  send(
    params: Nostr.EventParameters,
    options?: RxNostrSendOptions,
  ): Observable<OkPacketAgainstEvent> {
    const { relays, errorOnTimeout } = makeRxNostrSendOptions(options);
    const signer: EventSigner = options?.signer ?? this.config.signer;

    const targetRelays =
      relays === undefined
        ? this.defaultWritables
        : relays.map((url) => this.ensureNostrConnection(url));
    const subject = new Subject<OkPacketAgainstEvent>();
    const finishedRelays = new Set<string>();
    let eventId = "";

    const teardown = () => {
      if (!subject.closed) {
        subject.complete();
      }

      for (const conn of targetRelays) {
        conn.confirmOK(eventId);
      }
    };

    signer
      .signEvent(params)
      .then((event) => {
        if (subject.closed) {
          return;
        }

        eventId = event.id;

        this.ok$
          .pipe(filter(({ eventId }) => eventId === event.id))
          .subscribe(subject);

        for (const conn of targetRelays) {
          conn.publish(event);
        }
      })
      .catch((err) => {
        teardown();

        throw new RxNostrInvalidUsageError(
          err instanceof Error ? err.message : "Failed to sign the given event",
        );
      });

    return subject.pipe(
      takeWhile(({ from, done }) => {
        if (done) {
          finishedRelays.add(from);
        }
        return finishedRelays.size < targetRelays.length;
      }, true),
      takeUntil(this.dispose$),
      errorOnTimeout
        ? timeout(this.config.okTimeout)
        : completeOnTimeout(this.config.okTimeout),
      finalize(teardown),
    );
  }

  dispose() {
    this[Symbol.dispose]();
  }

  [Symbol.dispose](): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    for (const conn of this.connections.values()) {
      conn.dispose();
    }
    this.connections.clear();

    const subjects = [
      this.event$,
      this.ok$,
      this.fin$,
      this.all$,
      this.connectionState$,
      this.error$,
      this.outgoing$,
    ];
    for (const sub of subjects) {
      sub.complete();
    }

    this.dispose$.next();
    this.dispose$.complete();
  }
}
