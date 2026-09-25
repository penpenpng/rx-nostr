import { finalize, map, Subject, switchAll, type Observable, type Subscription } from "rxjs";
import type { AuthenticatorInput } from "../../authenticator/index.ts";
import { emitDiagnostic } from "../../diagnostics/index.ts";
import type { LazyFilter } from "../../lazy-filter/index.ts";
import { once, type RelayUrl } from "../../libs/index.ts";
import { mapStored } from "../../operators/general/map-stored.ts";
import { setDiff } from "../../operators/index.ts";
import type { EventPacket } from "../../packets/index.ts";
import { RxRelays } from "../../rx-relays/index.ts";
import type { RxReq } from "../../rx-req/index.ts";
import type { RelayInput } from "../../types/index.ts";
import { ConnectionDemandScope, type RelayDemandWindow } from "../connection-demand-scope.ts";
import type { RelayCommunicationCollection } from "../relay-pool.ts";
import { FilledRxNostrReqOptions } from "../rx-nostr.config.ts";

export function reqForward({
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
        segmentRelays: packet.relays ? RxRelays.from(packet.relays) : RxRelays.from(sessionRelays),
        filters: packet.filters,
        linger: packet.linger ?? config.linger,
        traceTag: packet.traceTag,
        skipValidateFilterMatching: config.skipValidateFilterMatching,
        authenticator: config.authenticator,
      }),
    ),
    // Forward: To keep the latch, we need to subsccribe next stream before the previous one ends.
    mapStored(
      (obs, cleanupPrev) => {
        const stream = new Subject<EventPacket>();
        const sub = obs.subscribe(stream);
        cleanupPrev();
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
  authenticator: AuthenticatorInput | undefined;
}): Observable<EventPacket> {
  const warming = segmentRelays.subscribe((destRelays) => {
    relays.forEach(destRelays, (relay) => {
      connectionDemand.prewarm(relay);
    });
  });

  // Use Map because we assume that `relay.url` is normalized.
  // Forward: Only one subscription (segment) at most is held on the same relay.
  const ongoings = new Map<RelayUrl, { demandWindow: RelayDemandWindow; sub: Subscription }>();

  const stream = new Subject<EventPacket>();

  const relaySub = segmentRelays
    .asObservable()
    .pipe(setDiff())
    .subscribe(({ current, appended, outdated }) => {
      if (!sessionRelays.disposed) {
        if ((outdated?.size ?? 0) === 0 && current.size <= 0) {
          const message = "A REQ was issued without any destination relays.";
          emitDiagnostic({
            severity: "warning",
            occurredAt: Date.now(),
            message,
          });
          stream.complete();
          return;
        }
        if (outdated && outdated.size > 0 && current.size <= 0) {
          const message = "The last relay was removed; no destination relays remain.";
          emitDiagnostic({
            severity: "warning",
            occurredAt: Date.now(),
            message,
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
            authenticator,
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

      relays.forEach(sessionRelays, (relay) => {
        ongoings.get(relay.url)?.demandWindow.close();
      });
      ongoings.clear();

      segmentRelays.dispose();

      stream.complete();
    }),
  );
}
