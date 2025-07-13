import { Subject, type Observable } from "rxjs";
import { AwaitableQueue, type RelayUrl } from "../../libs/index.ts";
import type { EventPacket, ProgressActivity } from "../../packets";
import type { IRelayCommunication } from "../../rx-nostr/relay-communication";

export class RelayCommunicationMock implements IRelayCommunication {
  refCount = 0;
  connectedCount = 0;
  releasedCount = 0;
  channels = new AwaitableQueue<Observable<EventPacket>>();

  constructor(public url: RelayUrl) {}

  connect(): Promise<void> {
    this.connectedCount++;
    this.refCount++;
    return Promise.resolve();
  }

  release(): void {
    this.releasedCount++;
    this.refCount--;
  }

  vreq(): Observable<EventPacket> {
    try {
      return this.channels.dequeueSync();
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
