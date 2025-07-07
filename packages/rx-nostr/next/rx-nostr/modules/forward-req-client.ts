import {
  finalize,
  Subject,
  subscribeOn,
  takeUntil,
  type Observable,
} from "rxjs";
import {
  once,
  RxDisposableStack,
  type RelayMapOperator,
} from "../../libs/index.ts";
import { watchChanges } from "../../operators/general/watch-changes.ts";
import { setDiff, withPrevious } from "../../operators/index.ts";
import type { EventPacket } from "../../packets/index.ts";
import { RxRelays } from "../../rx-relays/index.ts";
import type { RxReq } from "../../rx-req/index.ts";
import type { RelayCommunication } from "../relay-communication.ts";
import { FilledRxNostrReqOptions } from "../rx-nostr.config.ts";
import type { RelayInput } from "../rx-nostr.interface.ts";
import { SessionLifecycle } from "../session-lifecycle.ts";

export class ForwardReqClient {
  private stack = new RxDisposableStack();

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
    const session = new SessionLifecycle(config);
    const forget = this.stack.temporary(session);

    const stream = new Subject<Observable<EventPacket>>();

    this.relays.forEach(RxRelays.array(relays), (relay) => {
      session.prewarm(relay);
    });

    throw new Error();

    this.stack.add(
      RxRelays.observable(relays)
        .pipe(setDiff())
        .subscribe(({ appended, outdated }) => {
          if (activeFilters) {
            this.relays.forEach(appended, (relay) => {
              session.begin(relay);
              stream.next(relay.vreq(rxReq.strategy, activeFilters));
            });
            this.relays.forEach(outdated, (relay) => {
              // TODO: unsub here
              session.end(relay);
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
          session.begin(relay);
          // TODO: linger, relays, traceId
          stream.next(relay.vreq(rxReq.strategy, nextReq.filters));
        });
      } else if (updated === "relays") {
      }
    });
    subscriptions.add(sub);

    return stream.pipe(
      finalize(() => void stack.dispose()),
      takeUntil(this.dispose$),
      subscribeOn(asapScheduler),
    );
  }

  [Symbol.dispose] = once(() => {
    this.stack.dispose();
  });
  dispose = this[Symbol.dispose];
}

class SingleForwardReq {}
