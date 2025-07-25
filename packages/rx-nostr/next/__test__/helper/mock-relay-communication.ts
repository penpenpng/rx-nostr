import { filter, Subject, type Observable } from "rxjs";
import { assert, expect } from "vitest";
import type { LazyFilter } from "../../index.ts";
import { AwaitableQueue, Latch, u, type RelayUrl } from "../../libs/index.ts";
import type { EventPacket, ProgressActivity } from "../../packets";
import type { IRelayCommunication } from "../../rx-nostr/relay-communication";

export class RelayCommunicationMock implements IRelayCommunication {
  isHot = false;
  channels = new AwaitableQueue<Observable<EventPacket>>();
  queryLog = new AwaitableQueue<LazyFilter[]>();
  latch = new Latch({
    onHeldUp: () => {
      this.latchedCount++;
    },
    onDropped: () => {
      this.unlatchedCount++;
    },
  });
  latchedCount = 0;
  unlatchedCount = 0;

  constructor(public url: RelayUrl) {}

  vreq(
    _strategy: "forward" | "backward",
    filters: LazyFilter[],
  ): Observable<EventPacket> {
    try {
      this.queryLog.enqueue(filters);

      return (
        this.channels
          .dequeueSync()
          // emulate that closed stream provides no events.
          .pipe(
            filter((packet) => {
              const flag = this.latch.isHeld || this.isHot;
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

  eventOut = new Subject<ProgressActivity>();

  event(): Observable<ProgressActivity> {
    return this.eventOut.asObservable();
  }

  sendProgress(): void {}
}
