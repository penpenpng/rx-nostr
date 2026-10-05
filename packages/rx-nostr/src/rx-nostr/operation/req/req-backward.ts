import { EMPTY, finalize, map, mergeAll, Subject, type Observable, type Subscription } from "rxjs";

import { emitDiagnostic } from "../../../diagnostics/index.ts";
import type { LazyFilter } from "../../../lazy-filter/index.ts";
import { RelaySet, type RelayUrl } from "../../../libs/index.ts";
import { setDiff } from "../../../operators/index.ts";
import type { EventPacket, ReqPacket } from "../../../packets/index.ts";
import { RxRelays } from "../../../rx-relays/index.ts";
import type { RelayInput } from "../../../types/index.ts";
import type { IRelayCommunicationCollection } from "../../communication/index.ts";
import { ConnectionDemandScope, type RelayDemandWindow } from "../demand/index.ts";
import { FilledRxNostrReqOptions } from "./options.ts";

export function reqBackward({
  relays,
  source$,
  relayInput,
  config,
  connectionDemand = new ConnectionDemandScope(config),
}: {
  relays: IRelayCommunicationCollection;
  source$: Observable<ReqPacket>;
  relayInput: RelayInput;
  config: FilledRxNostrReqOptions;
  connectionDemand?: ConnectionDemandScope;
}): Observable<EventPacket> {
  const defaultRelays = RxRelays.from(relayInput);

  const warming = defaultRelays
    .asObservable()
    .pipe(setDiff())
    .subscribe(({ appended, outdated }) => {
      relays.forEach(appended, (relay) => {
        connectionDemand.prewarm(relay);
      });
      relays.forEach(outdated, (relay) => connectionDemand.releasePrewarm(relay));
    });

  return source$.pipe(
    map((packet) => {
      if (packet.filters.length === 0) {
        relays.forEach(defaultRelays, (relay) => connectionDemand.releasePrewarm(relay));

        return EMPTY;
      }

      return req({
        connectionDemand,
        relays,
        defaultRelays,
        requestRelays: packet.relays ? RxRelays.from(packet.relays) : RxRelays.from(defaultRelays),
        filters: packet.filters,
        linger: packet.linger ?? config.linger,
        traceTag: packet.traceTag,
        skipValidateFilterMatching: config.skipValidateFilterMatching,
        eoseTimeout: config.timeout,
      });
    }),
    // BackwardReq: New coming req doesn't affect the previous one.
    mergeAll(),
    finalize(() => {
      warming.unsubscribe();
      connectionDemand.finish();
      defaultRelays.dispose();
    }),
  );
}

function req({
  connectionDemand,
  relays,
  defaultRelays,
  requestRelays,
  filters,
  linger,
  traceTag,
  skipValidateFilterMatching,
  eoseTimeout,
}: {
  connectionDemand: ConnectionDemandScope;
  relays: IRelayCommunicationCollection;
  defaultRelays: RxRelays;
  requestRelays: RxRelays;
  filters: LazyFilter[];
  linger: number;
  traceTag?: string | number;
  skipValidateFilterMatching: boolean;
  eoseTimeout: number;
}): Observable<EventPacket> {
  const warming = requestRelays.subscribe((destRelays) => {
    relays.forEach(destRelays, (relay) => {
      connectionDemand.prewarm(relay);
    });
  });

  // Use Map because we assume that `relay.url` is normalized.
  const ongoings = new Map<RelayUrl, { demandWindow: RelayDemandWindow; sub: Subscription }>();
  const started = new RelaySet();
  const finished = new RelaySet();

  const stream = new Subject<EventPacket>();
  const completeIfFinished = () => {
    if ([...requestRelays].every((url) => finished.has(url))) {
      stream.complete();
    }
  };

  const sub = requestRelays
    .asObservable()
    .pipe(setDiff())
    .subscribe(({ current, appended, outdated }) => {
      if (!defaultRelays.disposed) {
        let nomore = false;

        if ((outdated?.size ?? 0) === 0 && current.size <= 0) {
          const message = "A REQ was issued without any destination relays.";

          emitDiagnostic({
            level: "warning",
            event: "req/no-destination-relays",
            message,
            context: { operation: "backward" },
          });

          nomore = true;
        }
        if (outdated && outdated.size > 0 && current.size <= 0) {
          const message = "The last relay was removed; no destination relays remain.";

          emitDiagnostic({
            level: "warning",
            event: "req/no-destination-relays",
            message,
            context: { operation: "backward" },
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

        if (!finalized) {
          ongoings.set(relay.url, { demandWindow, sub });
        }
      });

      relays.forEach(outdated, (relay) => {
        const query = ongoings.get(relay.url);

        ongoings.delete(relay.url);

        // Backward: End a demand window here because we don't know when the next REQ will come.
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

      requestRelays.dispose();

      stream.complete();
    }),
  );
}
