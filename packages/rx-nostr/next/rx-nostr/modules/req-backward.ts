import {
  finalize,
  map,
  mergeAll,
  Subject,
  timeout,
  type Observable,
  type Subscription,
} from "rxjs";
import type { LazyFilter } from "../../lazy-filter/index.ts";
import { RelayMap, RelaySet, type RelayMapOperator } from "../../libs/index.ts";
import { setDiff } from "../../operators/index.ts";
import type { EventPacket } from "../../packets/index.ts";
import { RxRelays } from "../../rx-relays/index.ts";
import type { RxReq } from "../../rx-req/index.ts";
import type { RelayCommunication } from "../relay-communication.ts";
import { FilledRxNostrReqOptions } from "../rx-nostr.config.ts";
import type { RelayInput } from "../rx-nostr.interface.ts";
import { SessionLifecycle } from "../session-lifecycle.ts";

export function reqBackward({
  relays,
  rxReq,
  relayInput,
  config,
}: {
  relays: RelayMapOperator<RelayCommunication>;
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
        segmentScopeRelays: RxRelays.from(packet.relays),
        filters: packet.filters,
        linger: config.linger ?? packet.linger ?? 0,
        eoseTimeout: config.timeout,
      }),
    ),
    // BackwardReq: New coming req doesn't affect the previous one.
    mergeAll(),
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
  eoseTimeout,
}: {
  session: SessionLifecycle;
  relays: RelayMapOperator<RelayCommunication>;
  sessionScopeRelays: RxRelays;
  segmentScopeRelays: RxRelays;
  filters: LazyFilter[];
  linger: number;
  eoseTimeout: number;
}): Observable<EventPacket> {
  const destRelays = RxRelays.union(sessionScopeRelays, segmentScopeRelays);

  const warming = segmentScopeRelays.subscribe((destRelays) => {
    relays.forEach(destRelays, (relay) => {
      session.prewarm(relay);
    });
  });

  const ongoings = new RelayMap<Subscription>();
  const started = new RelaySet();
  const finished = new RelaySet();

  const stream = new Subject<EventPacket>();

  const sub = destRelays
    .asObservable()
    .pipe(setDiff())
    .subscribe(({ appended, outdated }) => {
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
            timeout(eoseTimeout),
            finalize(() => {
              session.endSegment(relay, linger);
              finished.add(relay.url);

              // Backward:
              // If this is the last uncompleted subscription, complete the output stream
              // to ignore relays appended thereafter.
              if ([...destRelays].every((url) => finished.has(url))) {
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

      relays.forEach(destRelays, (relay) => {
        session.endSegment(relay, linger);
      });

      sub.unsubscribe();
      segmentScopeRelays.dispose();
      destRelays.dispose();
    }),
  );
}
