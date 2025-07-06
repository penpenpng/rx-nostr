import type * as Nostr from "nostr-typedef";
import {
  EMPTY,
  finalize,
  Observable,
  Subject,
  Subscription,
  takeUntil,
  timeout,
} from "rxjs";
import { once, RelayMapOperator, RxDisposables } from "../../libs/index.ts";
import { Logger } from "../../logger.ts";
import { timeoutWith } from "../../operators/index.ts";
import type { ProgressActivity, ProgressPacket } from "../../packets/index.ts";
import { RxRelays } from "../../rx-relays/index.ts";
import { RelayCommunication } from "../relay-communication.ts";
import { FilledRxNostrPublishOptions } from "../rx-nostr.config.ts";
import type { RelayInput } from "../rx-nostr.interface.ts";
import { SessionLifecycle } from "../session-lifecycle.ts";

export class EventPublisher {
  protected disposables = new RxDisposables();

  constructor(private relays: RelayMapOperator<RelayCommunication>) {}

  publish({
    params,
    relays,
    config,
  }: {
    params: Nostr.EventParameters;
    relays: RelayInput;
    config: FilledRxNostrPublishOptions;
  }): Observable<ProgressPacket> {
    const targetRelays = RxRelays.array(relays);

    if (targetRelays.length <= 0) {
      Logger.warn("No relays to send event to");
      return EMPTY;
    }

    const stream = new Subject<ProgressActivity>();
    const session = this.disposables.adopt(
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

      this.disposables.add(
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
      finalize(() => void this.dispose()),
      this.disposables.whileAlive(),
      // TODO: ProgressPacket を作る
      summarize(),
    );
  }

  [Symbol.dispose] = once(() => {
    this.disposables.dispose();
  });
  dispose = this[Symbol.dispose];
}
