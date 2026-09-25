import {
  finalize,
  map,
  mergeAll,
  Subject,
  type Observable,
  type Subscription,
} from "rxjs";
import type { AuthenticatorInput } from "../../authenticator/index.ts";
import { emitDiagnostic } from "../../diagnostics/index.ts";
import type { LazyFilter } from "../../lazy-filter/index.ts";
import { RelaySet, type RelayUrl } from "../../libs/index.ts";
import { setDiff } from "../../operators/index.ts";
import type { EventPacket } from "../../packets/index.ts";
import { RxRelays } from "../../rx-relays/index.ts";
import type { RxReq } from "../../rx-req/index.ts";
import type { RelayInput } from "../../types/index.ts";
import {
  ConnectionDemandScope,
  type RelayDemandWindow,
} from "../connection-demand-scope.ts";
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
  const connectionDemand = new ConnectionDemandScope(config);
  const sessionRelays = RxRelays.from(relayInput);

  const warming = sessionRelays.subscribe((destRelays) => {
    relays.forEach(destRelays, (relay) => {
      connectionDemand.prewarm(relay);
    });
  });

  return rxReq.asObservable().pipe(
    map((packet) =>
      req({
        connectionDemand,
        relays,
        sessionRelays,
        segmentRelays: packet.relays
          ? RxRelays.from(packet.relays)
          : RxRelays.from(sessionRelays),
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
      connectionDemand.dispose();
      sessionRelays.dispose();
    }),
  );
}

function req({
  connectionDemand,
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
  connectionDemand: ConnectionDemandScope;
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
  const warming = segmentRelays.subscribe((destRelays) => {
    relays.forEach(destRelays, (relay) => {
      connectionDemand.prewarm(relay);
    });
  });

  // Use Map because we assume that `relay.url` is normalized.
  const ongoings = new Map<
    RelayUrl,
    { demandWindow: RelayDemandWindow; sub: Subscription }
  >();
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
      if (!sessionRelays.disposed) {
        let nomore = false;
        if ((outdated?.size ?? 0) === 0 && current.size <= 0) {
          const message = "A REQ was issued without any destination relays.";
          emitDiagnostic({
            severity: "warning",
            occurredAt: Date.now(),
            message,
          });
          nomore = true;
        }
        if (outdated && outdated.size > 0 && current.size <= 0) {
          const message =
            "The last relay was removed; no destination relays remain.";
          emitDiagnostic({
            severity: "warning",
            occurredAt: Date.now(),
            message,
          });
          nomore = true;
        }
        if (nomore) {
          // Backward: If no relays are set, complete the stream.
          stream.complete();
          return;
        }
      }

      // Open a new demand window before the previous window closes
      // to prevent WebSocket blinks when `linger` is 0.
      relays.forEach(appended, (relay) => {
        // Backward: Do nothing on re-appended relays.
        if (started.has(relay.url)) {
          return;
        }
        started.add(relay.url);

        const demandWindow = connectionDemand.openDemandWindow(relay, linger);

        let finalized = false;
        const queryRef: { sub?: Subscription } = {};
        const sub = relay
          .vreq("backward", filters, {
            timeout: eoseTimeout,
            validateFilterMatching: !skipValidateFilterMatching,
            authenticator,
          })
          .pipe(
            map((packet) =>
              traceTag === undefined ? packet : { ...packet, traceTag },
            ),
            // Backward: When a REQ on a relay is done or times out...
            finalize(() => {
              finalized = true;
              const currentQuery = ongoings.get(relay.url);
              if (currentQuery?.sub === queryRef.sub) {
                ongoings.delete(relay.url);
              }
              demandWindow.close();
              finished.add(relay.url);

              completeIfFinished();
            }),
          )
          .subscribe({
            next: (packet) => stream.next(packet),
            error: (error) => stream.error(error),
          });
        queryRef.sub = sub;
        if (!finalized) ongoings.set(relay.url, { demandWindow, sub });
      });

      relays.forEach(outdated, (relay) => {
        const query = ongoings.get(relay.url);
        ongoings.delete(relay.url);

        // Backward: End a segment here because we don't know when the next REQ will come.
        query?.sub.unsubscribe();
        query?.demandWindow.close();
      });
      completeIfFinished();
    });

  return stream.pipe(
    // Backward: New coming REQ doesn't kicks the finalizer.
    finalize(() => {
      warming.unsubscribe();

      for (const query of ongoings.values()) {
        query.sub.unsubscribe();
        query.demandWindow.close();
      }
      ongoings.clear();

      sub.unsubscribe();

      segmentRelays.dispose();

      stream.complete();
    }),
  );
}
