import { EMPTY, filter, Subject, Observable } from "rxjs";
import { expect } from "vitest";

import type { LazyFilter } from "../../index.ts";
import { once, type RelayUrl } from "../../libs/index.ts";
import type { EventPacket, OkPacket } from "../../packets";
import type { IRelayCommunication } from "../../rx-nostr/communication/index.ts";
import { QueueInspector } from "./queue-inspector.ts";

export class RelayCommunicationMock implements IRelayCommunication {
  isHot = false;
  channels = new QueueInspector<Observable<EventPacket>>();
  queryLog = new QueueInspector<LazyFilter[]>();
  #activeLeaseCount = 0;
  connectionAttemptCount = 0;

  constructor(public url: RelayUrl) {}

  get hasActiveLease(): boolean {
    return this.#activeLeaseCount > 0;
  }

  hold() {
    if (!this.hasActiveLease) {
      this.connectionAttemptCount++;
    }

    this.#activeLeaseCount++;

    return once(() => {
      this.#activeLeaseCount--;
    });
  }

  vreq(_strategy: "forward" | "backward", filters: LazyFilter[]): Observable<EventPacket> {
    if (!this.hasActiveLease && !this.isHot) {
      return EMPTY;
    }

    try {
      this.queryLog.push(filters);

      return (
        this.channels
          .takeNext()
          // emulate that closed stream provides no events.
          .pipe(
            filter((packet) => {
              const flag = this.hasActiveLease || this.isHot;

              if (!flag) {
                console.warn(
                  `An EventPacket was attempted to be sent from relay, but was not sent:\n`,
                  {
                    relay: this.url,
                    eventId: packet.event.id,
                  },
                );
              }

              return flag;
            }),
          )
      );
    } catch {
      throw new Error("No scheduled event stream available.");
    }
  }

  attachNextStream() {
    const stream = new Subject<EventPacket>();

    const { promise: subscribed, resolve } = Promise.withResolvers<void>();

    this.channels.push(
      new Observable<EventPacket>((subscriber) => {
        resolve();

        return stream.subscribe(subscriber);
      }),
    );

    return Object.assign(stream, { subscribed });
  }

  async expectFilters(filters: Partial<LazyFilter>[]): Promise<void> {
    await expect(this.queryLog.waitNext()).resolves.toEqual(filters);
  }

  eventOut = new Subject<OkPacket>();

  event(): Observable<OkPacket> {
    return this.eventOut.asObservable();
  }

  sendProgress(): void {}
}
