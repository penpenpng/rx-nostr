import {
  finalize,
  identity,
  map,
  mergeAll,
  Subject,
  tap,
  timeout,
  type Observable,
  type Subscription,
} from "rxjs";
import type { LazyFilter } from "../../lazy-filter/index.ts";
import {
  RelaySet,
  type RelayMapOperator,
  type RelayUrl,
} from "../../libs/index.ts";
import { Logger } from "../../logger.ts";
import { filterBy, setDiff } from "../../operators/index.ts";
import type { EventPacket } from "../../packets/index.ts";
import { RxRelays } from "../../rx-relays/index.ts";
import type { RxReq } from "../../rx-req/index.ts";
import { QuerySession, type QuerySegment } from "../query-session.ts";
import type { IRelayCommunication } from "../relay-communication.ts";
import { FilledRxNostrReqOptions } from "../rx-nostr.config.ts";
import type { RelayInput } from "../rx-nostr.interface.ts";

export function reqBackward({
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
  Logger.debug("new backward REQ session");
  const session = new QuerySession(config);
  const sessionRelays = RxRelays.from(relayInput);

  const warming = sessionRelays.subscribe((destRelays) => {
    relays.forEach(destRelays, (relay) => {
      Logger.debug("session prewarm", relay.url);
      session.prewarm(relay);
    });
  });

  return rxReq.asObservable().pipe(
    tap((packet) => {
      Logger.trace(packet.traceTag, "new backward REQ segment");
    }),
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
        eoseTimeout: config.timeout,
      }),
    ),
    // BackwardReq: New coming req doesn't affect the previous one.
    mergeAll(),
    finalize(() => {
      warming.unsubscribe();
      session.dispose();
      sessionRelays.dispose();
      Logger.debug("end backward REQ session");
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
  eoseTimeout,
}: {
  session: QuerySession;
  relays: RelayMapOperator<IRelayCommunication>;
  sessionRelays: RxRelays;
  segmentRelays: RxRelays;
  filters: LazyFilter[];
  linger: number;
  traceTag?: string | number;
  skipValidateFilterMatching: boolean;
  eoseTimeout: number;
}): Observable<EventPacket> {
  const warming = segmentRelays.subscribe((destRelays) => {
    relays.forEach(destRelays, (relay) => {
      Logger.trace(traceTag, `segment prewarm ${relay.url}`);
      session.prewarm(relay);
    });
  });

  // Use Map because we assume that `relay.url` is normalized.
  const ongoings = new Map<
    RelayUrl,
    { segment: QuerySegment; sub: Subscription }
  >();
  const started = new RelaySet();
  const finished = new RelaySet();

  const stream = new Subject<EventPacket>();

  const sub = segmentRelays
    .asObservable()
    .pipe(setDiff())
    .subscribe(({ current, appended, outdated }) => {
      Logger.trace(traceTag, "updated dest relays", {
        current,
        appended,
        outdated,
      });

      if (!sessionRelays.disposed) {
        let nomore = false;
        if (!outdated && current.size <= 0) {
          Logger.warn("REQ was issued, but no destination relays is set.");
          nomore = true;
        }
        if (outdated && outdated.size > 0 && current.size <= 0) {
          Logger.warn(
            "The last relay was removed; no destination relays remain.",
          );
          nomore = true;
        }
        if (nomore) {
          // Backward: If no relays are set, complete the stream.
          stream.complete();
          return;
        }
      }

      // Begin new segment before the previous segment ends
      // to prevent WebSocket blinks when `linger` is 0.
      relays.forEach(appended, (relay) => {
        // Backward: Do nothing on re-appended relays.
        if (started.has(relay.url)) {
          return;
        }
        started.add(relay.url);

        const segment = session.beginSegment(relay, linger);
        Logger.trace(traceTag, `new segment on ${relay.url}`);

        const sub = relay
          .vreq("backward", filters)
          .pipe(
            skipValidateFilterMatching ? identity : filterBy(filters),
            // Backward: If it times out, the REQ should be terminated.
            timeout(eoseTimeout),
            // Backward: When a REQ on a relay is done or times out...
            finalize(() => {
              segment.endSegment();
              Logger.trace(traceTag, `end segment on ${relay.url}`);
              finished.add(relay.url);

              if ([...segmentRelays].every((url) => finished.has(url))) {
                stream.complete();
              }
            }),
          )
          .subscribe(stream);

        ongoings.set(relay.url, { segment, sub });
      });

      relays.forEach(outdated, (relay) => {
        const query = ongoings.get(relay.url);
        ongoings.delete(relay.url);

        // Backward: End a segment here because we don't know when the next REQ will come.
        query?.sub.unsubscribe();
        query?.segment.endSegment();
      });
    });

  return stream.pipe(
    // Backward: New coming REQ doesn't kicks the finalizer.
    finalize(() => {
      warming.unsubscribe();

      for (const query of ongoings.values()) {
        query.sub.unsubscribe();
        query.segment.endSegment();
      }
      ongoings.clear();

      sub.unsubscribe();

      segmentRelays.dispose();

      stream.complete();
      Logger.trace(traceTag, "finalized segment");
    }),
  );
}
