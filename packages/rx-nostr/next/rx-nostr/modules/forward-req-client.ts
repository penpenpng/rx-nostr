import {
  finalize,
  Subject,
  subscribeOn,
  Subscription,
  takeUntil,
  type Observable,
} from "rxjs";
import { once, type RelayMapOperator } from "../../libs/index.ts";
import { watchChanges } from "../../operators/general/watch-changes.ts";
import { setDiff, withPrevious } from "../../operators/index.ts";
import type { EventPacket } from "../../packets/index.ts";
import { RxRelays } from "../../rx-relays/index.ts";
import type { RxReq } from "../../rx-req/index.ts";
import type { RelayCommunication } from "../relay-communication.ts";
import { FilledRxNostrReqOptions } from "../rx-nostr.config.ts";
import type { RelayInput } from "../rx-nostr.interface";
import { SessionLifecycle } from "../session-lifecycle.ts";

export class ForwardReqClient {
  constructor(private relays: RelayMapOperator<RelayCommunication>) {}

  req({
    rxReq,
    relays,
    config,
  }: {
    rxReq: RxReq;
    relays: RelayInput;
    config: FilledRxNostrReqOptions;
  }): Observable<EventPacket> {
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

  [Symbol.dispose] = once(() => {});
  dispose = this[Symbol.dispose];
}
