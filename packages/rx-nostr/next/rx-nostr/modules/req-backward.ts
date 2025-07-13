import {
  finalize,
  identity,
  map,
  mergeAll,
  Subject,
  timeout,
  type Observable,
  type Subscription,
} from "rxjs";
import type { LazyFilter } from "../../lazy-filter/index.ts";
import { RelayMap, RelaySet, type RelayMapOperator } from "../../libs/index.ts";
import { Logger } from "../../logger.ts";
import { filterBy, setDiff } from "../../operators/index.ts";
import type { EventPacket } from "../../packets/index.ts";
import { RxRelays } from "../../rx-relays/index.ts";
import type { RxReq } from "../../rx-req/index.ts";
import type { IRelayCommunication } from "../relay-communication.ts";
import { FilledRxNostrReqOptions } from "../rx-nostr.config.ts";
import type { RelayInput } from "../rx-nostr.interface.ts";
import { SessionLifecycle } from "../session-lifecycle.ts";

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
  const session = new SessionLifecycle(config);
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
        eoseTimeout: config.timeout,
      }),
    ),
    // BackwardReq: New coming req doesn't affect the previous one.
    mergeAll(),
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
  eoseTimeout,
}: {
  session: SessionLifecycle;
  relays: RelayMapOperator<IRelayCommunication>;
  sessionRelays: RxRelays;
  segmentRelays: RxRelays;
  filters: LazyFilter[];
  linger: number;
  skipValidateFilterMatching: boolean;
  eoseTimeout: number;
}): Observable<EventPacket> {
  const warming = segmentRelays.subscribe((destRelays) => {
    relays.forEach(destRelays, (relay) => {
      session.prewarm(relay);
    });
  });

  const ongoings = new RelayMap<Subscription>();
  const started = new RelaySet();
  const finished = new RelaySet();

  const stream = new Subject<EventPacket>();

  const sub = segmentRelays
    .asObservable()
    .pipe(setDiff())
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

      relays.forEach(appended, (relay) => {
        // Backward: Do nothing on re-appended relays.
        if (started.has(relay.url)) {
          return;
        }
        started.add(relay.url);

        session.beginSegment(relay);

        const sub = relay
          .vreq("backward", filters)
          .pipe(
            skipValidateFilterMatching ? identity : filterBy(filters),
            timeout(eoseTimeout),
            finalize(() => {
              session.endSegment(relay, linger);
              finished.add(relay.url);

              // Backward:
              // If this is the last uncompleted subscription, complete the output stream
              // to ignore relays appended thereafter.
              if ([...segmentRelays].every((url) => finished.has(url))) {
                stream.complete();
              }
            }),
          )
          .subscribe(stream);

        ongoings.get(relay.url)?.add(sub);
      });

      relays.forEach(outdated, (relay) => {
        ongoings.get(relay.url)?.unsubscribe();
        ongoings.delete(relay.url);

        session.endSegment(relay, linger);
      });
    });

  return stream.pipe(
    // Backward: New coming REQ doesn't kicks the finalizer.
    finalize(() => {
      warming.unsubscribe();

      for (const ongoing of ongoings.values()) {
        ongoing.unsubscribe();
      }
      ongoings.clear();

      sub.unsubscribe();

      relays.forEach(segmentRelays, (relay) => {
        session.endSegment(relay, linger);
      });

      segmentRelays.dispose();

      stream.complete();
    }),
  );
}
