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
import {
  once,
  type RelayMapOperator,
  type RelayUrl,
} from "../../libs/index.ts";
import { Logger } from "../../logger.ts";
import { mapStored } from "../../operators/general/map-stored.ts";
import { tapOnce } from "../../operators/general/tap-once.ts";
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
  Logger.debug("new forward REQ session");
  const session = new QuerySession(config);
  const sessionRelays = RxRelays.from(relayInput);

  const warming = sessionRelays.subscribe((destRelays) => {
    relays.forEach(destRelays, (relay) => {
      const prewarmed = session.prewarm(relay);
      if (prewarmed) {
        Logger.debug("session prewarm", relay.url);
      }
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
        traceTag: packet.traceTag,
        skipValidateFilterMatching: config.skipValidateFilterMatching,
      }),
    ),
    // Forward: To keep the latch, we need to subsccribe next stream before the previous one ends.
    mapStored(
      (obs, cleanupPrev) => {
        const stream = new Subject<EventPacket>();
        const sub = obs
          .pipe(tapOnce(cleanupPrev), finalize(cleanupPrev))
          .subscribe(stream);
        return [
          stream,
          once(() => {
            sub.unsubscribe();
            stream.complete();
          }),
        ];
      },
      {
        initialStore: () => {},
        cleanup: (cleanupLast) => {
          cleanupLast();
        },
      },
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
  traceTag,
  skipValidateFilterMatching,
}: {
  session: QuerySession;
  relays: RelayMapOperator<IRelayCommunication>;
  sessionRelays: RxRelays;
  segmentRelays: RxRelays;
  filters: LazyFilter[];
  linger: number;
  traceTag?: string | number;
  skipValidateFilterMatching: boolean;
}): Observable<EventPacket> {
  Logger.trace(traceTag, "new forward REQ segment");

  const warming = segmentRelays.subscribe((destRelays) => {
    relays.forEach(destRelays, (relay) => {
      const prewarmed = session.prewarm(relay);
      if (prewarmed) {
        Logger.trace(traceTag, `segment prewarm ${relay.url}`);
      }
    });
  });

  // Use Map because we assume that `relay.url` is normalized.
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
      Logger.trace(traceTag, "updated dest relays", {
        current,
        appended,
        outdated,
      });

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

      // Begin new segment before the previous segment ends
      // to prevent WebSocket blinks when `linger` is 0.
      relays.forEach(appended, (relay) => {
        const segment = session.beginSegment(relay, linger);
        Logger.trace(traceTag, `new segment on ${relay.url}`);

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
        query?.segment.endSegment();
        Logger.trace(traceTag, `end segment on ${relay.url}`);
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

      relays.forEach(sessionRelays, (relay) => {
        ongoings.get(relay.url)?.segment.endSegment();
      });
      ongoings.clear();

      segmentRelays.dispose();

      stream.complete();
      Logger.trace(traceTag, "finalized segment");
    }),
  );
}
