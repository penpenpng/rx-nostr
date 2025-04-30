import type * as Nostr from "nostr-typedef";
import {
  EMPTY,
  finalize,
  of,
  Subject,
  Subscription,
  takeUntil,
  type Observable,
} from "rxjs";
import type { LazyFilter } from "../lazy-filter/index.ts";
import { once } from "../libs/once.ts";
import { type RelayUrl } from "../libs/relay-urls.ts";
import { Logger } from "../logger.ts";
import { changelog } from "../operators/changelog.ts";
import { timeoutWith } from "../operators/timeout-with.ts";
import type {
  ConnectionStatePacket,
  EventPacket,
  ProgressActivity,
  ProgressPacket,
} from "../packets/index.ts";
import { RxRelays } from "../rx-relays/index.ts";
import type { IRxReq } from "../rx-req/index.ts";
import { CommunicationFacade } from "./communication-facade.ts";
import { RefCountLifeCycle } from "./ref-count-life-cycle.ts";
import { RelayCommunication } from "./relay-communication.ts";
import {
  FilledRxNostrConfig,
  FilledRxNostrEventOptions,
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
  protected facade = new CommunicationFacade();

  constructor(config: RxNostrConfig) {
    this.config = new FilledRxNostrConfig(config);
  }

  req(rxReq: IRxReq, config: RxNostrReqConfig): Observable<EventPacket>;
  req(
    filters: Iterable<LazyFilter>,
    config: RxNostrReqConfig,
  ): Observable<EventPacket>;
  req(
    arg: IRxReq | Iterable<LazyFilter>,
    config: RxNostrReqConfig,
  ): Observable<EventPacket> {}

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
    const subs = disposables.adopt(new Subscription(), (v) => v.unsubscribe());
    const lifecycle = new RefCountLifeCycle({
      defer: false,
      weak: config.weak,
      linger: config.linger,
    });

    this.facade.forEach(targetRelays, (relay) => {
      lifecycle.prepare(relay);
    });

    const publish = (relay: RelayCommunication, event: Nostr.Event) => {
      const timeoutActivity: ProgressActivity = {
        state: "timeout",
        relay: relay.url,
      };

      const sub = relay
        .event(event)
        .pipe(
          finalize(() => void lifecycle.end(relay)),
          timeoutWith(of(timeoutActivity), config.timeout),
        )
        .subscribe(stream);

      subs.add(sub);
    };

    config.signer
      .signEvent(params)
      .then((event) => {
        this.facade.forEach(targetRelays, (relay) => {
          publish(relay, event);
        });
      })
      .catch((error) => {
        Logger.error("EventSigner throws:", error);
        stream.error(error);
      });

    return stream.pipe(
      finalize(() => {
        disposables.dispose();
        lifecycle.cleanup();
      }),
      takeUntil(this.dispose$),
      summarize(),
    );
  }

  setHotRelays(relays: RxRelays | Iterable<string>): void {
    let lastValue: Set<RelayUrl>;
    let prevSubscription = this.hotRelaysSubscription;

    this.hotRelaysSubscription = RxRelays.observable(relays)
      .pipe(
        changelog(),
        finalize(() => {
          this.facade.forEach(lastValue, (relay) => relay.subRef());
        }),
      )
      .subscribe(({ current, appended, outdated }) => {
        lastValue = current;

        prevSubscription?.unsubscribe();
        prevSubscription = undefined;

        this.facade.forEach(appended, (relay) => relay.addRef());
        this.facade.forEach(outdated, (relay) => relay.subRef());
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
