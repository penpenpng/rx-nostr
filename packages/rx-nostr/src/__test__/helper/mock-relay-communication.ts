import { filter, Subject, type Observable } from "rxjs";
import { assert, expect } from "vitest";
import type { LazyFilter } from "../../index.ts";
import { AwaitableQueue, once, u, type RelayUrl } from "../../libs/index.ts";
import type { EventPacket, OkPacket } from "../../packets";
import type { IRelayCommunication } from "../../rx-nostr/communication/index.ts";

export class RelayCommunicationMock implements IRelayCommunication {
  isHot = false;
  channels = new AwaitableQueue<Observable<EventPacket>>();
  queryLog = new AwaitableQueue<LazyFilter[]>();
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
    try {
      this.queryLog.enqueue(filters);

      return (
        this.channels
          .dequeueSync()
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

    const subscribed = this.channels.enqueue(stream, 100);

    return Object.assign(stream, {
      subscribed: subscribed.catch(() => {
        throw new Error(`Stream was not subscribed (${this.url})`);
      }),
    });
  }

  async expectFilters(filters: Partial<LazyFilter>[]): Promise<void> {
    try {
      const value = await this.queryLog.dequeue(100);
      expect(value).toEqual(filters);
    } catch (err) {
      if (err instanceof u.Promise.TimeoutError) {
        assert.fail(`timeout (${this.url})`, JSON.stringify(filters));
      } else {
        throw err;
      }
    }
  }

  eventOut = new Subject<OkPacket>();

  event(): Observable<OkPacket> {
    return this.eventOut.asObservable();
  }

  sendProgress(): void {}
}
