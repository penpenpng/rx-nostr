import {
  asapScheduler,
  finalize,
  identity,
  map,
  Subject,
  subscribeOn,
  switchAll,
  type Observable,
  type Subscription,
} from "rxjs";
import type { LazyFilter } from "../../lazy-filter/index.ts";
import { type RelayMapOperator, type RelayUrl } from "../../libs/index.ts";
import { Logger } from "../../logger.ts";
import { filterBy, setDiff } from "../../operators/index.ts";
import type { EventPacket } from "../../packets/index.ts";
import { RxRelays } from "../../rx-relays/index.ts";
import type { RxReq } from "../../rx-req/index.ts";
import { QuerySession, type QuerySegment } from "../query-session.ts";
import type { IRelayCommunication } from "../relay-communication.ts";
import { FilledRxNostrReqOptions } from "../rx-nostr.config.ts";
import type { RelayInput } from "../rx-nostr.interface.ts";

export function reqForward({
  relays,
  rxReq,
  relayInput,
  config,
}: {
  relays: RelayMapOperator<IRelayCommunication>;
  rxReq: RxReq;
  relayInput: RelayInput;
  config: FilledRxNostrReqOptions;
}): Observable<EventPacket> {
  const session = new QuerySession(config);
  const sessionRelays = RxRelays.from(relayInput);

  const warming = sessionRelays.subscribe((destRelays) => {
    relays.forEach(destRelays, (relay) => {
      session.prewarm(relay);
    });
  });

  return rxReq.asObservable().pipe(
    map((packet) =>
      req({
        session,
        relays,
        sessionRelays,
        segmentRelays: packet.relays
          ? RxRelays.from(packet.relays)
          : RxRelays.from(sessionRelays),
        filters: packet.filters,
        linger: config.linger ?? packet.linger ?? 0,
        skipValidateFilterMatching: config.skipValidateFilterMatching,
      }),
    ),
    // Forward: New coming req unsubscribes the previous one.
    switchAll(),
    finalize(() => {
      warming.unsubscribe();
      session.dispose();
      sessionRelays.dispose();
    }),
  );
}

function req({
  session,
  relays,
  sessionRelays,
  segmentRelays,
  filters,
  linger,
  skipValidateFilterMatching,
}: {
  session: QuerySession;
  relays: RelayMapOperator<IRelayCommunication>;
  sessionRelays: RxRelays;
  segmentRelays: RxRelays;
  filters: LazyFilter[];
  linger: number;
  skipValidateFilterMatching: boolean;
}): Observable<EventPacket> {
  const warming = segmentRelays.subscribe((destRelays) => {
    relays.forEach(destRelays, (relay) => {
      session.prewarm(relay);
    });
  });

  // Assume that `relay.url` is normalized.
  // Forward: Only one subscription (segment) at most is held on the same relay.
  const ongoings = new Map<
    RelayUrl,
    { segment: QuerySegment; sub: Subscription }
  >();

  const stream = new Subject<EventPacket>();

  const relaySub = segmentRelays
    .asObservable()
    .pipe(
      setDiff(),
      // The subscription must be started after the stream is returned.
      subscribeOn(asapScheduler),
    )
    .subscribe(({ current, appended, outdated }) => {
      if (!sessionRelays.disposed) {
        if (!outdated && current.size <= 0) {
          Logger.warn("REQ was issued, but no destination relays is set.");
        }
        if (outdated && outdated.size > 0 && current.size <= 0) {
          Logger.warn(
            "The last relay was removed; no destination relays remain.",
          );
        }
      }

      // Forward:
      // Begin new segment before the previous segment ends
      // to prevent WebSocket blinks when `linger` is 0.
      relays.forEach(appended, (relay) => {
        const segment = session.beginSegment(relay, linger);
        const sub = relay
          .vreq("forward", filters)
          .pipe(skipValidateFilterMatching ? identity : filterBy(filters))
          .subscribe(stream);

        ongoings.set(relay.url, { segment, sub });
      });

      relays.forEach(outdated, (relay) => {
        const query = ongoings.get(relay.url);
        ongoings.delete(relay.url);

        query?.sub.unsubscribe();

        // Forward: Session scope relays are still needed.
        if (!sessionRelays.has(relay.url)) {
          console.log("relay endSegment", !!query?.segment, relay.url);
          // Forward: End segment on session scope relays.
          query?.segment.endSegment();
        }
      });
    });

  return stream.pipe(
    // Forward: New coming REQ kicks the finalizer with `switchAll()`.
    finalize(() => {
      warming.unsubscribe();

      // Forward: New coming REQ ends the current REQ, but segments on session scope relays are still needed.
      for (const query of ongoings.values()) {
        query.sub.unsubscribe();
      }

      relaySub.unsubscribe();

      RxRelays.set(segmentRelays)
        .difference(RxRelays.set(sessionRelays))
        .forEach((relay) => {
          ongoings.get(relay)?.segment.endSegment();
        });
      ongoings.clear();

      segmentRelays.dispose();

      stream.complete();
    }),
  );
}
