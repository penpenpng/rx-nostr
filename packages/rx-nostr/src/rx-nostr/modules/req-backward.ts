import { finalize, map, mergeAll, Subject, type Observable, type Subscription } from "rxjs";
import type { AuthenticatorInput } from "../../authenticator/index.ts";
import type { LazyFilter } from "../../lazy-filter/index.ts";
import { RelaySet, type RelayUrl } from "../../libs/index.ts";
import { Logger } from "../../logger.ts";
import { setDiff } from "../../operators/index.ts";
import type { EventPacket } from "../../packets/index.ts";
import { RxRelays } from "../../rx-relays/index.ts";
import type { RxReq } from "../../rx-req/index.ts";
import type { RelayInput } from "../../types/index.ts";
import { QuerySession, type QuerySegment } from "../query-session.ts";
import type { RelayCommunicationCollection } from "../relay-pool.ts";
import { FilledRxNostrReqOptions } from "../rx-nostr.config.ts";

export function reqBackward({
  relays,
  rxReq,
  relayInput,
  config,
}: {
  relays: RelayCommunicationCollection;
  rxReq: RxReq;
  relayInput: RelayInput;
  config: FilledRxNostrReqOptions;
}): Observable<EventPacket> {
  Logger.debug("new backward REQ session");
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
        segmentRelays: packet.relays ? RxRelays.from(packet.relays) : RxRelays.from(sessionRelays),
        filters: packet.filters,
        linger: packet.linger ?? config.linger,
        traceTag: packet.traceTag,
        skipValidateFilterMatching: config.skipValidateFilterMatching,
        eoseTimeout: config.timeout,
        authenticator: config.authenticator,
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
  authenticator,
}: {
  session: QuerySession;
  relays: RelayCommunicationCollection;
  sessionRelays: RxRelays;
  segmentRelays: RxRelays;
  filters: LazyFilter[];
  linger: number;
  traceTag?: string | number;
  skipValidateFilterMatching: boolean;
  eoseTimeout: number;
  authenticator: AuthenticatorInput | undefined;
}): Observable<EventPacket> {
  Logger.trace(traceTag, "new backward REQ segment");

  const warming = segmentRelays.subscribe((destRelays) => {
    relays.forEach(destRelays, (relay) => {
      const prewarmed = session.prewarm(relay);
      if (prewarmed) {
        Logger.trace(traceTag, `segment prewarm ${relay.url}`);
      }
    });
  });

  // Use Map because we assume that `relay.url` is normalized.
  const ongoings = new Map<RelayUrl, { segment: QuerySegment; sub: Subscription }>();
  const started = new RelaySet();
  const finished = new RelaySet();

  const stream = new Subject<EventPacket>();
  const completeIfFinished = () => {
    if ([...segmentRelays].every((url) => finished.has(url))) {
      stream.complete();
    }
  };

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
        if ((outdated?.size ?? 0) === 0 && current.size <= 0) {
          Logger.warn("REQ was issued, but no destination relays is set.");
          nomore = true;
        }
        if (outdated && outdated.size > 0 && current.size <= 0) {
          Logger.warn("The last relay was removed; no destination relays remain.");
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

        let finalized = false;
        const queryRef: { sub?: Subscription } = {};
        const sub = relay
          .vreq("backward", filters, {
            timeout: eoseTimeout,
            validateFilterMatching: !skipValidateFilterMatching,
            authenticator,
          })
          .pipe(
            map((packet) => (traceTag === undefined ? packet : { ...packet, traceTag })),
            // Backward: When a REQ on a relay is done or times out...
            finalize(() => {
              finalized = true;
              const currentQuery = ongoings.get(relay.url);
              if (currentQuery?.sub === queryRef.sub) {
                ongoings.delete(relay.url);
              }
              segment.endSegment();
              Logger.trace(traceTag, `end segment on ${relay.url}`);
              finished.add(relay.url);

              completeIfFinished();
            }),
          )
          .subscribe({
            next: (packet) => stream.next(packet),
            error: (error) => stream.error(error),
          });
        queryRef.sub = sub;
        if (!finalized) ongoings.set(relay.url, { segment, sub });
      });

      relays.forEach(outdated, (relay) => {
        const query = ongoings.get(relay.url);
        ongoings.delete(relay.url);

        // Backward: End a segment here because we don't know when the next REQ will come.
        query?.sub.unsubscribe();
        query?.segment.endSegment();
      });
      completeIfFinished();
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
