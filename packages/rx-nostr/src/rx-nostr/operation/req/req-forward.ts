import { finalize, map, Subject, switchAll, type Observable, type Subscription } from "rxjs";

import { emitDiagnostic } from "../../../diagnostics/index.ts";
import type { LazyFilter } from "../../../lazy-filter/index.ts";
import { once, type RelayUrl } from "../../../libs/index.ts";
import { setDiff } from "../../../operators/index.ts";
import type { EventPacket, ReqPacket } from "../../../packets/index.ts";
import { RxRelays } from "../../../rx-relays/index.ts";
import type { RelayInput } from "../../../types/index.ts";
import type { IRelayCommunicationCollection } from "../../communication/index.ts";
import { ConnectionDemandScope, type RelayDemandWindow } from "../demand/index.ts";
import { FilledRxNostrReqOptions } from "./options.ts";

export function reqForward({
  relays,
  source$,
  relayInput,
  config,
}: {
  relays: IRelayCommunicationCollection;
  source$: Observable<ReqPacket>;
  relayInput: RelayInput;
  config: FilledRxNostrReqOptions;
}): Observable<EventPacket> {
  const connectionDemand = new ConnectionDemandScope(config);
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
  let cleanupLast = () => {};

  return source$.pipe(
    map((packet) =>
      req({
        connectionDemand,
        relays,
        defaultRelays,
        requestRelays: packet.relays ? RxRelays.from(packet.relays) : RxRelays.from(defaultRelays),
        filters: packet.filters,
        linger: packet.linger ?? config.linger,
        traceTag: packet.traceTag,
        skipValidateFilterMatching: config.skipValidateFilterMatching,
      }),
    ),
    // Forward: To keep the lease, subscribe to the next stream before the previous one ends.
    map((obs) => {
      const stream = new Subject<EventPacket>();
      const sub = obs.subscribe(stream);
      cleanupLast();
      cleanupLast = once(() => {
        sub.unsubscribe();
        stream.complete();
      });
      return stream;
    }),
    // Forward: New coming req unsubscribes the previous one.
    switchAll(),
    finalize(() => {
      cleanupLast();
      warming.unsubscribe();
      connectionDemand.dispose();
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
}: {
  connectionDemand: ConnectionDemandScope;
  relays: IRelayCommunicationCollection;
  defaultRelays: RxRelays;
  requestRelays: RxRelays;
  filters: LazyFilter[];
  linger: number;
  traceTag?: string | number;
  skipValidateFilterMatching: boolean;
}): Observable<EventPacket> {
  const warming = requestRelays.subscribe((destRelays) => {
    relays.forEach(destRelays, (relay) => {
      connectionDemand.prewarm(relay);
    });
  });

  // Use Map because we assume that `relay.url` is normalized.
  // Forward: At most one active vreq is held on the same relay for this request.
  const ongoings = new Map<RelayUrl, { demandWindow: RelayDemandWindow; sub: Subscription }>();

  const stream = new Subject<EventPacket>();

  const relaySub = requestRelays
    .asObservable()
    .pipe(setDiff())
    .subscribe(({ current, appended, outdated }) => {
      if (!defaultRelays.disposed) {
        if ((outdated?.size ?? 0) === 0 && current.size <= 0) {
          const message = "A REQ was issued without any destination relays.";
          emitDiagnostic({
            level: "warning",
            event: "req/no-destination-relays",
            message,
            context: { operation: "forward" },
          });
          stream.complete();
          return;
        }
        if (outdated && outdated.size > 0 && current.size <= 0) {
          const message = "The last relay was removed; no destination relays remain.";
          emitDiagnostic({
            level: "warning",
            event: "req/no-destination-relays",
            message,
            context: { operation: "forward" },
          });
        }
      }

      // Open a new demand window before the previous window closes
      // to prevent WebSocket blinks when `linger` is 0.
      relays.forEach(appended, (relay) => {
        const demandWindow = connectionDemand.openDemandWindow(relay, linger);

        let finalized = false;
        const queryRef: { sub?: Subscription } = {};
        const sub = relay
          .vreq("forward", filters, {
            validateFilterMatching: !skipValidateFilterMatching,
          })
          .pipe(
            map((packet) => (traceTag === undefined ? packet : { ...packet, traceTag })),
            finalize(() => {
              finalized = true;
              const currentQuery = ongoings.get(relay.url);
              if (currentQuery?.sub === queryRef.sub) {
                ongoings.delete(relay.url);
              }
              demandWindow.close();
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

        query?.sub.unsubscribe();

        // Forward: Operation-scope relays are still needed.
        query?.demandWindow.close();
      });
    });

  return stream.pipe(
    // Forward: New coming REQ kicks the finalizer with `switchAll()`.
    finalize(() => {
      warming.unsubscribe();

      // Forward: A new REQ ends the current vreq, but operation-scope relays are still needed.
      for (const query of ongoings.values()) {
        query.sub.unsubscribe();
      }

      relaySub.unsubscribe();

      relays.forEach(defaultRelays, (relay) => {
        ongoings.get(relay.url)?.demandWindow.close();
      });
      ongoings.clear();

      requestRelays.dispose();

      stream.complete();
    }),
  );
}
