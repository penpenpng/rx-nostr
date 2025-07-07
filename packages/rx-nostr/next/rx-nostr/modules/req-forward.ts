import {
  finalize,
  map,
  merge,
  mergeMap,
  Subject,
  switchAll,
  type Observable,
  type Subscription,
} from "rxjs";
import type { LazyFilter } from "../../lazy-filter/index.ts";
import { RelayMap, type RelayMapOperator } from "../../libs/index.ts";
import { finalizeWithLast, setDiff } from "../../operators/index.ts";
import type { EventPacket } from "../../packets/index.ts";
import { RxRelays } from "../../rx-relays/index.ts";
import type { RxReq } from "../../rx-req/index.ts";
import type { RelayCommunication } from "../relay-communication.ts";
import { FilledRxNostrReqOptions } from "../rx-nostr.config.ts";
import type { RelayInput } from "../rx-nostr.interface.ts";
import { SessionLifecycle } from "../session-lifecycle.ts";

export function reqForward({
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
      }),
    ),
    switchAll(), // New coming req unsubscribes the previous one (ForwardReq).
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
}: {
  session: SessionLifecycle;
  relays: RelayMapOperator<RelayCommunication>;
  sessionScopeRelays: RxRelays;
  segmentScopeRelays: RxRelays;
  filters: LazyFilter[];
  linger: number;
}): Observable<EventPacket> {
  const destRelays = RxRelays.union(sessionScopeRelays, segmentScopeRelays);

  const warming = segmentScopeRelays.subscribe((destRelays) => {
    relays.forEach(destRelays, (relay) => {
      session.prewarm(relay);
    });
  });

  const stream = new Subject<EventPacket>();
  const ongoings = new RelayMap<Subscription>();

  const sub = destRelays
    .asObservable()
    .pipe(
      setDiff(),
      finalizeWithLast((diff) => {
        relays.forEach(diff?.current, (relay) => {
          if (!sessionScopeRelays.has(relay.url)) {
            session.end(relay, linger);
          }
        });
      }),
    )
    .subscribe(({ appended, outdated }) => {
      // Begin new session before the previous session ends
      // to prevent WebSocket blinks when `linger` is 0.
      relays.forEach(appended, (relay) => {
        session.begin(relay);
        ongoings.set(
          relay.url,
          relay.vreq("forward", filters).subscribe(stream),
        );
      });

      relays.forEach(outdated, (relay) => {
        ongoings.get(relay.url)?.unsubscribe();
        ongoings.delete(relay.url);

        // Session scope relays are still needed.
        if (!sessionScopeRelays.has(relay.url)) {
          session.end(relay, linger);
        }
      });

      return merge(
        ...relays.map(appended, (relay) => relay.vreq("forward", filters)),
      );
    });

  return stream.pipe(
    finalize(() => {
      warming.unsubscribe();
      ongoings.values().forEach((ongoing) => {
        ongoing.unsubscribe();
      });
      ongoings.clear();
      sub.unsubscribe();
      segmentScopeRelays.dispose();
      destRelays.dispose();
    }),
  );
}
