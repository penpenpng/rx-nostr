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
import { RelayMap, type RelayMapOperator } from "../../libs/index.ts";
import { Logger } from "../../logger.ts";
import { filterBy, setDiff } from "../../operators/index.ts";
import type { EventPacket } from "../../packets/index.ts";
import { RxRelays } from "../../rx-relays/index.ts";
import type { RxReq } from "../../rx-req/index.ts";
import type { IRelayCommunication } from "../relay-communication.ts";
import { FilledRxNostrReqOptions } from "../rx-nostr.config.ts";
import type { RelayInput } from "../rx-nostr.interface.ts";
import { SessionLifecycle } from "../session-lifecycle.ts";

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
  const session = new SessionLifecycle(config);
  const sessionScopeRelays = RxRelays.from(relayInput);

  const warming = sessionScopeRelays.subscribe((destRelays) => {
    relays.forEach(destRelays, (relay) => {
      session.prewarm(relay);
    });
  });

  return rxReq.asObservable().pipe(
    map((packet) =>
      req({
        session,
        relays,
        sessionScopeRelays,
        segmentScopeRelays: packet.relays
          ? RxRelays.from(packet.relays)
          : RxRelays.from(sessionScopeRelays),
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
      sessionScopeRelays.dispose();
    }),
  );
}

function req({
  session,
  relays,
  sessionScopeRelays,
  segmentScopeRelays,
  filters,
  linger,
  skipValidateFilterMatching,
}: {
  session: SessionLifecycle;
  relays: RelayMapOperator<IRelayCommunication>;
  sessionScopeRelays: RxRelays;
  segmentScopeRelays: RxRelays;
  filters: LazyFilter[];
  linger: number;
  skipValidateFilterMatching: boolean;
}): Observable<EventPacket> {
  const warming = segmentScopeRelays.subscribe((destRelays) => {
    relays.forEach(destRelays, (relay) => {
      session.prewarm(relay);
    });
  });

  // Forward: Only one subscription (segment) at most is held on the same relay.
  const ongoings = new RelayMap<Subscription>();

  const stream = new Subject<EventPacket>();

  const relaySub = segmentScopeRelays
    .asObservable()
    .pipe(
      setDiff(),
      // The subscription must be started after the stream is returned.
      subscribeOn(asapScheduler),
    )
    .subscribe(({ current, appended, outdated }) => {
      if (!sessionScopeRelays.disposed) {
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
        session.beginSegment(relay);

        ongoings.set(
          relay.url,
          relay
            .vreq("forward", filters)
            .pipe(skipValidateFilterMatching ? identity : filterBy(filters))
            .subscribe(stream),
        );
      });

      relays.forEach(outdated, (relay) => {
        ongoings.get(relay.url)?.unsubscribe();
        ongoings.delete(relay.url);

        // Forward: Session scope relays are still needed.
        if (!sessionScopeRelays.has(relay.url)) {
          session.endSegment(relay, linger);
        }
      });
    });

  return stream.pipe(
    // Forward: New coming REQ kicks the finalizer with `switchAll()`.
    finalize(() => {
      warming.unsubscribe();

      // Forward: New coming REQ ends the current REQ, but segments on session scope relays are still needed.
      for (const ongoing of ongoings.values()) {
        ongoing.unsubscribe();
      }
      ongoings.clear();

      relaySub.unsubscribe();

      relays.forEach(segmentScopeRelays, (relay) => {
        if (sessionScopeRelays.has(relay.url)) {
          return;
        }
        session.endSegment(relay, linger);
      });

      segmentScopeRelays.dispose();

      stream.complete();
    }),
  );
}
