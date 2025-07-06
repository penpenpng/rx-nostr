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
import { once, RelayMapOperator, type RelayUrl } from "../libs/index.ts";
import { Logger } from "../logger.ts";
import { watchChanges } from "../operators/general/watch-changes.ts";
import {
  setDiff,
  timeoutWith,
  withPrevious,
  type SetDiff,
} from "../operators/index.ts";
import type {
  ConnectionStatePacket,
  EventPacket,
  ProgressActivity,
  ProgressPacket,
  ReqPacket,
} from "../packets/index.ts";
import { RxRelays } from "../rx-relays/index.ts";
import { RxOneshotReq, RxReq } from "../rx-req/index.ts";
import { RelayCommunication } from "./relay-communication.ts";
import { RelayWarmer } from "./relay-warmer.ts";
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
import { SessionLifecycle } from "./session-lifecycle.ts";

export class RxNostr implements IRxNostr {
  protected disposables = new DisposableStack();
  protected dispose$ = new Subject<void>();
  protected config: FilledRxNostrConfig;
  protected relays = new RelayMapOperator((url) => new RelayCommunication(url));
  protected warmer = this.disposables.use(new RelayWarmer(this.relays));

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
    const session = disposables.adopt(new SessionLifecycle(config), (v) =>
      v.cleanup(),
    );

    this.relays.forEach(RxRelays.array(relays), (relay) => {
      session.preconnect(relay);
    });

    subscriptions.add(
      RxRelays.observable(relays)
        .pipe(setDiff())
        .subscribe(({ appended, outdated }) => {
          if (activeFilters) {
            this.relays.forEach(appended, (relay) => {
              session.connect(relay);
              stream.next(relay.vreq(rxReq.strategy, activeFilters));
            });
            this.relays.forEach(outdated, (relay) => {
              // TODO: unsub here
              session.release(relay);
            });
          }
        }),
    );

    // combine でやっていくの無理そうかも
    // active filter は forward では先頭だけ見ればいいけど
    // backward では全ての filter を見ないといけない
    const sub = watchChanges({
      req: rxReq.asObservable().pipe(withPrevious()),
      relays: RxRelays.observable(relays).pipe(setDiff()),
    }).subscribe(([updated, state]) => {
      const [prevReq, nextReq] = state.req;
      const { current, appended, outdated } = state.relays;

      if (updated === "req") {
        this.relays.forEach(current, (relay) => {
          session.connect(relay);
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
    const session = disposables.adopt(
      new SessionLifecycle({
        defer: false,
        weak: config.weak,
        linger: config.linger,
      }),
      (v) => v.cleanup(),
    );

    this.relays.forEach(targetRelays, (relay) => {
      session.preconnect(relay);
    });

    const publish = (relay: RelayCommunication, event: Nostr.Event) => {
      session.connect(relay);

      subscriptions.add(
        relay
          .event(event)
          .pipe(
            finalize(() => void session.release(relay)),
            timeout(config.timeout),
            timeoutWith({
              state: "timeout",
              relay: relay.url,
            } as const),
          )
          .subscribe(stream),
      );
    };

    config.signer
      .signEvent(params)
      .then((event) => {
        this.relays.forEach(targetRelays, (relay) => {
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

  setHotRelays = this.warmer.setHotRelays;
  unsetHotRelays = this.warmer.unsetHotRelays;

  monitorConnectionState(): Observable<ConnectionStatePacket> {}

  [Symbol.dispose] = once(() => {
    this.disposables.dispose();
    this.dispose$.next();
    this.dispose$.complete();
  });
  dispose = this[Symbol.dispose];
}
