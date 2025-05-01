import type * as Nostr from "nostr-typedef";
import {
  asapScheduler,
  combineLatest,
  defer,
  EMPTY,
  finalize,
  map,
  merge,
  mergeScan,
  Observable,
  of,
  scan,
  Subject,
  subscribeOn,
  Subscription,
  takeUntil,
  timeout,
} from "rxjs";
import type { LazyFilter } from "../lazy-filter/index.ts";
import { once } from "../libs/once.ts";
import { RelayMapOperator, type RelayUrl } from "../libs/relay-urls.ts";
import { Logger } from "../logger.ts";
import {
  diff,
  sealOnTimeout,
  withPrevious,
  type SetDiff,
} from "../operators/index.ts";
import { watchChanges } from "../operators/watch-changes.ts";
import type {
  ConnectionStatePacket,
  EventPacket,
  ProgressActivity,
  ProgressPacket,
  ReqPacket,
} from "../packets/index.ts";
import { RxRelays } from "../rx-relays/index.ts";
import { RxOneshotReq, RxReq } from "../rx-req/index.ts";
import { ConnectionLifecycle } from "./connection-lifecycle.ts";
import { RelayCommunication } from "./relay-communication.ts";
import {
  FilledRxNostrConfig,
  FilledRxNostrEventOptions,
  FilledRxNostrReqOptions,
} from "./rx-nostr.config.ts";
import type {
  IRxNostr,
  RxNostrConfig,
  RxNostrEventConfig,
  RxNostrReqConfig,
} from "./rx-nostr.interface.ts";

export class RxNostr implements IRxNostr {
  protected disposables = new DisposableStack();
  protected dispose$ = new Subject<void>();
  protected hotRelaysSubscription?: Subscription;
  protected config: FilledRxNostrConfig;
  protected relays = new RelayMapOperator((url) => new RelayCommunication(url));

  constructor(config: RxNostrConfig) {
    this.config = new FilledRxNostrConfig(config);
  }

  req(
    arg: RxReq | LazyFilter | Iterable<LazyFilter>,
    config: RxNostrReqConfig,
  ): Observable<EventPacket> {
    const rxReq: RxReq = (() => {
      if (arg instanceof RxReq) {
        return arg;
      } else if (Symbol.iterator in arg) {
        return new RxOneshotReq([...arg]);
      } else {
        return new RxOneshotReq(arg);
      }
    })();

    return defer(() => this._req(rxReq, config));
  }

  private _req(
    rxReq: RxReq,
    { relays, ...options }: RxNostrReqConfig,
  ): Observable<EventPacket> {
    const config = new FilledRxNostrReqOptions(options, this.config);
    const stream = new Subject<Observable<EventPacket>>();
    const disposables = new DisposableStack();
    const subscriptions = disposables.adopt(new Subscription(), (v) =>
      v.unsubscribe(),
    );
    const lifecycle = disposables.adopt(new ConnectionLifecycle(config), (v) =>
      v.cleanup(),
    );

    this.relays.forEach(RxRelays.array(relays), (relay) => {
      lifecycle.preconnect(relay);
    });

    subscriptions.add(
      RxRelays.observable(relays)
        .pipe(diff())
        .subscribe(({ appended, outdated }) => {
          if (activeFilters) {
            this.relays.forEach(appended, async (relay) => {
              await lifecycle.connect(relay);
              stream.next(relay.vreq(rxReq.strategy, activeFilters!));
            });
            this.relays.forEach(outdated, (relay) => {
              // TODO: unsub here
              lifecycle.release(relay);
            });
          }
        }),
    );

    // combine でやっていくの無理そうかも
    // active filter は forward では先頭だけ見ればいいけど
    // backward では全ての filter を見ないといけない
    const sub = watchChanges({
      req: rxReq.asObservable().pipe(withPrevious()),
      relays: RxRelays.observable(relays).pipe(diff()),
    }).subscribe(([updated, state]) => {
      const [prevReq, nextReq] = state.req;
      const { current, appended, outdated } = state.relays;

      if (updated === "req") {
        this.relays.forEach(current, async (relay) => {
          await lifecycle.connect(relay);
          // TODO: linger, relays, traceId
          stream.next(relay.vreq(rxReq.strategy, nextReq.filters));
        });
      } else if (updated === "relays") {
      }
    });
    subscriptions.add(sub);

    return stream.pipe(
      finalize(() => void disposables.dispose()),
      takeUntil(this.dispose$),
      subscribeOn(asapScheduler),
    );
  }

  event(
    params: Nostr.EventParameters,
    { relays, ...options }: RxNostrEventConfig,
  ): Observable<ProgressPacket> {
    const targetRelays = RxRelays.array(relays);

    if (targetRelays.length <= 0) {
      Logger.warn("No relays to send event to");
      return EMPTY;
    }

    const config = new FilledRxNostrEventOptions(options, this.config);
    const stream = new Subject<ProgressActivity>();
    const disposables = new DisposableStack();
    const subscriptions = disposables.adopt(new Subscription(), (v) =>
      v.unsubscribe(),
    );
    const lifecycle = disposables.adopt(
      new ConnectionLifecycle({
        defer: false,
        weak: config.weak,
        linger: config.linger,
      }),
      (v) => v.cleanup(),
    );

    const publish = async (relay: RelayCommunication, event: Nostr.Event) => {
      await lifecycle.connect(relay);

      const sub = relay
        .event(event)
        .pipe(
          finalize(() => void lifecycle.release(relay)),
          timeout(config.timeout),
          sealOnTimeout({
            state: "timeout",
            relay: relay.url,
          } as const),
        )
        .subscribe(stream);
      subscriptions.add(sub);
    };

    this.relays.forEach(targetRelays, (relay) => {
      lifecycle.preconnect(relay);
    });

    config.signer
      .signEvent(params)
      .then((event) => {
        this.relays.forEach(targetRelays, async (relay) => {
          publish(relay, event);
        });
      })
      .catch((error) => {
        Logger.error("EventSigner throws:", error);
        stream.error(error);
      });

    return stream.pipe(
      finalize(() => void disposables.dispose()),
      takeUntil(this.dispose$),
      summarize(),
    );
  }

  setHotRelays(relays: RxRelays | Iterable<string>): void {
    let lastValue: Set<RelayUrl>;
    let prevSubscription = this.hotRelaysSubscription;

    this.hotRelaysSubscription = RxRelays.observable(relays)
      .pipe(
        diff(),
        finalize(() => {
          this.relays.forEach(lastValue, (relay) => relay.release());
        }),
      )
      .subscribe(({ current, appended, outdated }) => {
        lastValue = current;

        prevSubscription?.unsubscribe();
        prevSubscription = undefined;

        this.relays.forEach(appended, (relay) => relay.connect());
        this.relays.forEach(outdated, (relay) => relay.release());
      });
  }

  unsetHotRelays(): void {
    this.setHotRelays([]);
  }

  monitorConnectionState(): Observable<ConnectionStatePacket> {}

  [Symbol.dispose] = once(() => {
    this.hotRelaysSubscription?.unsubscribe();
    this.disposables.dispose();
    this.dispose$.next();
    this.dispose$.complete();
  });
  dispose = this[Symbol.dispose];
}
