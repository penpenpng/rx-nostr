import Nostr from "nostr-typedef";
import {
  filter,
  finalize,
  first,
  identity,
  map,
  merge,
  mergeAll,
  Observable,
  ReplaySubject,
  Subject,
  switchAll,
  take,
  takeUntil,
  tap,
  timeout,
} from "rxjs";

import { makeRxNostrConfig, type RxNostrConfig } from "../config.js";
import { NostrConnection, type REQMode } from "../connection/index.js";
import {
  RxNostrAlreadyDisposedError,
  RxNostrInvalidUsageError,
  RxNostrLogicError,
} from "../error.js";
import { getSignedEvent } from "../nostr/event.js";
import { completeOnTimeout } from "../operator.js";
import type {
  ConnectionState,
  ConnectionStatePacket,
  ErrorPacket,
  EventPacket,
  LazyFilter,
  LazyREQ,
  MessagePacket,
  OkPacket,
} from "../packet.js";
import type { RxReq } from "../req.js";
import { subtract, UrlMap } from "../utils.js";
import {
  type AcceptableDefaultRelaysConfig,
  type DefaultRelayConfig,
  makeRxNostrSendOptions,
  makeRxNostrUseOptions,
  type RxNostr,
  type RxNostrSendOptions,
  type RxNostrUseOptions,
} from "./interface.js";
import {
  makeLazyREQ,
  makeSubId,
  normalizeRelaysConfig,
  pickEvent,
} from "./utils.js";

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
  private weakSubscriptions: Map<string, { req: LazyREQ; autoclose: boolean }> =
    new Map();

  private event$ = new Subject<MessagePacket<Nostr.ToClientMessage.EVENT>>();
  private eose$ = new Subject<MessagePacket<Nostr.ToClientMessage.EOSE>>();
  private ok$ = new Subject<MessagePacket<Nostr.ToClientMessage.OK>>();
  private other$ = new Subject<MessagePacket<Nostr.ToClientMessage.Any>>();

  private error$ = new Subject<ErrorPacket>();
  private connectionState$ = new Subject<ConnectionStatePacket>();

  private dispose$ = new Subject<void>();
  private disposed = false;

  constructor(private config: RxNostrConfig) {}

  // #region @deprecated
  /** @deprecated */
  getRelays(): DefaultRelayConfig[] {
    return this.defaultRelays.toValues();
  }

  /** @deprecated */
  async switchRelays(config: AcceptableDefaultRelaysConfig): Promise<void> {
    this.setDefaultRelays(config);
  }
  /** @deprecated */
  async addRelay(relay: string | DefaultRelayConfig): Promise<void> {
    this.addDefaultRelays([relay]);
  }
  /** @deprecated */
  async removeRelay(url: string): Promise<void> {
    this.removeDefaultRelays(url);
  }

  /** @deprecated */
  hasRelay(url: string): boolean {
    return !!this.getDefaultRelay(url);
  }
  /** @deprecated */
  canReadRelay(url: string): boolean {
    return !!this.getDefaultRelay(url)?.read;
  }
  /** @deprecated */
  canWriteRelay(url: string): boolean {
    return !!this.getDefaultRelay(url)?.write;
  }
  // #endregion

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

      if (read) {
        nextReadableConnections.push(conn);
      }
    }

    this.updateWeakSubscriptions(nextReadableConnections);

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
    conn.getEoseObservable().subscribe(this.eose$);
    conn.getOkObservable().subscribe(this.ok$);
    conn.getOtherObservable().subscribe(this.other$);
    conn.getConnectionStateObservable().subscribe(this.connectionState$);
    conn.getErrorObservable().subscribe(this.error$);
  }
  private updateWeakSubscriptions(
    nextReadableConnections: NostrConnection[]
  ): void {
    const noLongerNeededConnections = subtract(
      this.defaultReadables,
      nextReadableConnections
    );

    for (const conn of noLongerNeededConnections) {
      conn.setKeepWeakSubscriptions(false);
    }
    for (const conn of nextReadableConnections) {
      conn.setKeepWeakSubscriptions(true);
      for (const { req, autoclose } of this.weakSubscriptions.values()) {
        conn?.subscribe(req, {
          mode: "weak",
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
  getAllRelayState(): Record<string, ConnectionState> {
    return Object.fromEntries(
      Array.from(this.connections.values()).map((e) => [
        e.url,
        e.connectionState,
      ])
    );
  }
  getRelayState(url: string): ConnectionState | undefined {
    const conn = this.connections.get(url);
    if (!conn) {
      return undefined;
    }

    return conn.connectionState;
  }
  // #endregion

  reconnect(url: string): void {
    const relay = this.getDefaultRelay(url);
    if (!relay) {
      throw new RxNostrInvalidUsageError(
        `The relay (${url}) is not a default relay. \`reconnect()\` can be used only for a readable default relay.`
      );
    }
    if (!relay.read) {
      throw new RxNostrInvalidUsageError(
        `The relay (${url}) is not readable. \`reconnect()\` can be used only for a readable default relay.`
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
    options?: Partial<RxNostrUseOptions>
  ): Observable<EventPacket> {
    const { relays } = makeRxNostrUseOptions(options);

    let mode: REQMode;
    let targetConnections: NostrConnection[];
    if (relays === undefined) {
      mode = "weak";
      targetConnections = this.defaultReadables;
    } else {
      mode = "normal";
      targetConnections = relays.map((url) => this.ensureNostrConnection(url));
    }

    const req$ = rxReq.getReqObservable().pipe(
      filter((filters): filters is LazyFilter[] => filters !== null),
      rxReq.strategy === "oneshot" ? first() : identity,
      map((filters, index) => makeLazyREQ({ rxReq, filters, index })),
      takeUntil(this.dispose$)
    );

    if (rxReq.strategy === "forward") {
      const subId = makeSubId({
        rxReq,
        index: 0,
      });

      return req$.pipe(
        tap((req) => {
          this.startSubscription({
            req,
            targetConnections,
            mode,
            overwrite: true,
            autoclose: false,
          });
        }),
        map((req) =>
          this.createForwardEventObservable({
            req,
          })
        ),
        switchAll(),
        finalize(() => {
          this.teardownSubscription({
            subId,
            targetConnections,
            mode,
          });
        })
      );
    } else {
      return req$.pipe(
        tap((req) => {
          this.startSubscription({
            req,
            targetConnections,
            mode,
            overwrite: false,
            autoclose: true,
          });
        }),
        map((req) =>
          this.createBackwardEventObservable({
            req,
            targetConnections,
          }).pipe(
            finalize(() => {
              const subId = req[1];

              this.teardownSubscription({
                subId,
                targetConnections,
                mode,
              });
            })
          )
        ),
        mergeAll()
      );
    }
  }
  private createForwardEventObservable(params: {
    req: LazyREQ;
  }): Observable<EventPacket> {
    const { req } = params;
    const subId = req[1];

    return this.event$.pipe(pickEvent(subId));
  }
  private createBackwardEventObservable(params: {
    req: LazyREQ;
    targetConnections: NostrConnection[];
  }): Observable<EventPacket> {
    const { req, targetConnections } = params;

    const isDown = (state: ConnectionState): boolean =>
      state === "error" || state === "rejected" || state === "terminated";

    const subId = req[1];
    const eose$ = new Subject<void>();
    const complete$ = new Subject<void>();
    const eoseRelays = new Set<string>();
    const manageCompletion = merge(eose$, this.connectionState$.asObservable())
      .pipe(
        filter(() => {
          const shouldComplete = targetConnections.every(
            ({ connectionState, url }) =>
              isDown(connectionState) || eoseRelays.has(url)
          );

          return shouldComplete;
        })
      )
      .subscribe(() => {
        complete$.next();
      });

    this.eose$
      .pipe(filter(({ message }) => message[1] === subId))
      .subscribe(({ from }) => {
        eoseRelays.add(from);
        eose$.next();
      });

    return this.event$.pipe(
      takeUntil(complete$),
      completeOnTimeout(this.config.eoseTimeout),
      finalize(() => {
        complete$.complete();
        eose$.complete();
        manageCompletion.unsubscribe();
      }),
      filter((e) => !eoseRelays.has(e.from)),
      pickEvent(subId)
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

    if (mode === "weak") {
      this.weakSubscriptions.set(subId, { req, autoclose });
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

    if (mode === "weak") {
      this.weakSubscriptions.delete(subId);
    }
    for (const conn of targetConnections) {
      conn.unsubscribe(subId);
    }
  }
  // #endregion use

  // #region createObservable
  createAllEventObservable(): Observable<EventPacket> {
    return this.event$.pipe(
      map(({ from, message }) => ({
        from,
        subId: message[1],
        event: message[2],
      }))
    );
  }
  createAllErrorObservable(): Observable<ErrorPacket> {
    return this.error$.asObservable();
  }
  createAllMessageObservable(): Observable<MessagePacket> {
    return merge(
      this.event$.asObservable(),
      this.eose$.asObservable(),
      this.ok$.asObservable(),
      this.other$.asObservable()
    );
  }
  createConnectionStateObservable(): Observable<ConnectionStatePacket> {
    return this.connectionState$.asObservable();
  }
  // #endregion

  send(
    params: Nostr.EventParameters,
    options?: RxNostrSendOptions
  ): Observable<OkPacket> {
    const { seckey } = makeRxNostrSendOptions(options);

    const targetRelays = this.defaultWritables;
    const subject = new ReplaySubject<OkPacket>(targetRelays.length);

    const teardown = () => {
      if (!subject.closed) {
        subject.complete();
      }
    };

    getSignedEvent(params, seckey)
      .then((event) => {
        if (subject.closed) {
          return;
        }

        this.ok$
          .pipe(
            filter(({ message: [, eventId] }) => eventId === event.id),
            map(({ from, message: [, id, ok] }) => ({ from, id, ok }))
          )
          .subscribe(subject);

        for (const conn of this.defaultWritables) {
          conn.publish(event);
        }
      })
      .catch((err) => {
        teardown();

        throw new RxNostrInvalidUsageError(
          err instanceof Error ? err.message : "Failed to sign the given event"
        );
      });

    return subject.pipe(
      take(targetRelays.length),
      takeUntil(this.dispose$),
      timeout(this.config.okTimeout),
      finalize(teardown)
    );
  }

  dispose(): void {
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
      this.eose$,
      this.other$,
      this.connectionState$,
      this.error$,
    ];
    for (const sub of subjects) {
      sub.complete();
    }

    this.dispose$.next();
    this.dispose$.complete();
  }
}
