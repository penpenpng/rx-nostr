import type * as Nostr from "nostr-typedef";
import {
  EMPTY,
  finalize,
  merge,
  Observable,
  Subject,
  timeout,
  type Subscription,
} from "rxjs";
import { RelayMapOperator } from "../../libs/index.ts";
import { Logger } from "../../logger.ts";
import { timeoutWith } from "../../operators/index.ts";
import type { ProgressActivity, ProgressPacket } from "../../packets/index.ts";
import { RxRelays } from "../../rx-relays/index.ts";
import { RelayCommunication } from "../relay-communication.ts";
import { FilledRxNostrPublishOptions } from "../rx-nostr.config.ts";
import type { RelayInput } from "../rx-nostr.interface.ts";
import { SessionLifecycle } from "../session-lifecycle.ts";

export function publish({
  relays,
  params,
  relayInput,
  config,
}: {
  relays: RelayMapOperator<RelayCommunication>;
  params: Nostr.EventParameters;
  relayInput: RelayInput;
  config: FilledRxNostrPublishOptions;
}): Observable<ProgressPacket> {
  const destRelays = RxRelays.array(relayInput);

  if (destRelays.length <= 0) {
    Logger.warn("No relays to send event to");
    return EMPTY;
  }

  const session = new SessionLifecycle({
    defer: false,
    weak: config.weak,
  });

  const stream = new Subject<ProgressActivity>();
  let sub: Subscription;

  relays.forEach(destRelays, (relay) => {
    session.prewarm(relay);
  });

  config.signer
    .signEvent(params)
    .then((event) => {
      relays.forEach(destRelays, (relay) => {
        session.beginSegment(relay);
      });

      const progress = relays.map(destRelays, (relay) =>
        relay.event(event).pipe(
          finalize(() => void session.endSegment(relay, config.linger)),
          timeout(config.timeout),
          timeoutWith({
            state: "timeout",
            relay: relay.url,
          } as const),
        ),
      );

      sub = merge(...progress).subscribe(stream);
    })
    .catch((error) => {
      Logger.error("EventSigner throws:", error);
      stream.error(error);
    });

  return stream.pipe(
    finalize(() => {
      sub?.unsubscribe();
      stream.complete();
      session.dispose();
    }),
    // TODO: ProgressPacket を作る
    summarize(),
  );
}
