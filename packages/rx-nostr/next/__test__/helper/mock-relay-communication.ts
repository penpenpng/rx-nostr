import { filter, Subject, type Observable } from "rxjs";
import { AwaitableQueue, Latch, type RelayUrl } from "../../libs/index.ts";
import type { EventPacket, ProgressActivity } from "../../packets";
import type { IRelayCommunication } from "../../rx-nostr/relay-communication";

export class RelayCommunicationMock implements IRelayCommunication {
  isHot = false;
  channels = new AwaitableQueue<Observable<EventPacket>>();
  latch = new Latch({
    onLatched: () => {
      this.latchedCount++;
    },
    onUnlatched: () => {
      this.unlatchedCount++;
    },
  });
  latchedCount = 0;
  unlatchedCount = 0;

  constructor(public url: RelayUrl) {}

  vreq(...args: unknown[]): Observable<EventPacket> {
    console.log("called vreq", ...args);
    try {
      return (
        this.channels
          .dequeueSync()
          // emulate that closed stream provides no events.
          .pipe(
            filter((packet) => {
              const flag = this.latch.isLatched || this.isHot;
              if (!flag) {
                console.warn(
                  this.url,
                  this.latch.isLatched,
                  this.isHot,
                  packet.event.id,
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

  eventOut = new Subject<ProgressActivity>();

  event(): Observable<ProgressActivity> {
    return this.eventOut.asObservable();
  }

  sendProgress(): void {}
}
