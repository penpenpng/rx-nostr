import type * as Nostr from "nostr-typedef";
import { EMPTY, finalize, Observable, Subject, timeout } from "rxjs";
import { once, RelayMapOperator, RxDisposableStack } from "../../libs/index.ts";
import { Logger } from "../../logger.ts";
import { timeoutWith } from "../../operators/index.ts";
import type { ProgressActivity, ProgressPacket } from "../../packets/index.ts";
import { RxRelays } from "../../rx-relays/index.ts";
import { RelayCommunication } from "../relay-communication.ts";
import { FilledRxNostrPublishOptions } from "../rx-nostr.config.ts";
import type { RelayInput } from "../rx-nostr.interface.ts";
import { SessionLifecycle } from "../session-lifecycle.ts";

export class EventPublisher {
  protected stack = new RxDisposableStack();

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

    const session = new SessionLifecycle({
      defer: false,
      weak: config.weak,
      linger: config.linger,
    });
    this.stack.use(session);

    const stream = new Subject<ProgressActivity>();

    this.relays.forEach(targetRelays, (relay) => {
      session.prewarm(relay);
    });

    const publish = (relay: RelayCommunication, event: Nostr.Event) => {
      session.begin(relay);

      this.stack.add(
        relay
          .event(event)
          .pipe(
            finalize(() => void session.end(relay)),
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
      this.stack.untilDisposed(),
      // TODO: ProgressPacket を作る
      summarize(),
    );
  }

  [Symbol.dispose] = once(() => {
    this.stack.dispose();
  });
  dispose = this[Symbol.dispose];
}
