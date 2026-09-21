import type * as Nostr from "nostr-typedef";
import { EMPTY, Observable, filter, map, startWith, take } from "rxjs";
import type { ConnectionRetryer } from "../connection-retryer/index.ts";
import { evalFilters, type LazyFilter } from "../lazy-filter/index.ts";
import { Latch, type RelayUrl } from "../libs/index.ts";
import type {
  EventMessagePacket,
  EventPacket,
  OkPacket,
  ProgressActivity,
} from "../packets/index.ts";
import type { WebSocketConstructor } from "../types/index.ts";
import { NostrTransport } from "./transport/index.ts";

export interface IRelayCommunication {
  url: RelayUrl;
  hold(): () => void;
  vreq(
    strategy: "forward" | "backward",
    filters: LazyFilter[],
  ): Observable<EventPacket>;
  event(event: Nostr.Event): Observable<ProgressActivity>;
}

export interface RelayCommunicationOptions {
  readonly WebSocket?: WebSocketConstructor;
  readonly retryer?: ConnectionRetryer;
}

// 将来、接続を多重化することがあればこのレイヤーで実装する
export class RelayCommunication implements IRelayCommunication {
  readonly #transport: NostrTransport;
  readonly #latch: Latch;
  #hotRelease?: () => void;
  #nextSubId = 0;

  constructor(
    public readonly url: RelayUrl,
    options: RelayCommunicationOptions = {},
  ) {
    this.#transport = new NostrTransport({
      url,
      WebSocket: options.WebSocket,
      retryer: options.retryer,
    });
    this.#latch = new Latch({
      onHeldUp: () => void this.#transport.open().catch(() => {}),
      onDropped: () => void this.#transport.close().catch(() => {}),
    });
  }

  hold(): () => void {
    return this.#latch.hold();
  }

  connect(): void {
    this.#hotRelease ??= this.hold();
  }

  release(): void {
    this.#hotRelease?.();
    this.#hotRelease = undefined;
  }

  vreq(
    strategy: "forward" | "backward",
    filters: LazyFilter[],
  ): Observable<EventPacket> {
    if (!this.#latch.isHeld) return EMPTY;

    const subId = `rx-nostr:${this.#nextSubId++}`;
    const query: Nostr.ToRelayMessage.REQ = [
      "REQ",
      subId,
      ...evalFilters(filters),
    ];
    const packets = this.#transport.subscribe({
      query,
      selector: (packet) => packet.type === "EVENT" && packet.subId === subId,
      terminator: (packet) =>
        (packet.type === "CLOSED" && packet.subId === subId) ||
        (strategy === "backward" &&
          packet.type === "EOSE" &&
          packet.subId === subId),
      retry: "resend",
    });

    return new Observable<EventPacket>((subscriber) => {
      const subscription = packets
        .pipe(
          filter(
            (packet): packet is EventMessagePacket => packet.type === "EVENT",
          ),
          map((packet) => ({
            from: packet.from,
            type: "EVENT" as const,
            event: packet.event,
          })),
        )
        .subscribe(subscriber);

      return () => {
        void this.#transport.cast(["CLOSE", subId]).catch(() => {});
        subscription.unsubscribe();
      };
    });
  }

  event(event: Nostr.Event): Observable<ProgressActivity> {
    if (!this.#latch.isHeld) return EMPTY;

    return this.#transport
      .subscribe({
        query: ["EVENT", event],
        selector: (packet) =>
          packet.type === "OK" && packet.eventId === event.id,
        retry: "resend",
      })
      .pipe(
        filter((packet): packet is OkPacket => packet.type === "OK"),
        map((packet) => ({
          from: this.url,
          state: "ok" as const,
          ok: packet.ok,
        })),
        take(1),
        startWith({ from: this.url, state: "sent" as const }),
      );
  }

  monitorConnectionState() {
    return this.#transport.state$.asObservable();
  }

  async dispose(): Promise<void> {
    this.release();
    await this.#transport.dispose();
  }
}
