import { Subject, type Observable } from "rxjs";
import type { RelayUrl } from "../../libs";
import type { EventPacket, ProgressActivity } from "../../packets";
import type { IRelayCommunication } from "../../rx-nostr/relay-communication";

export class RelayCommunicationMock implements IRelayCommunication {
  refCount = 0;
  connectedCount = 0;
  releasedCount = 0;

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

  channels: Array<{
    stream: Observable<EventPacket>;
    resolve: () => void;
  }> = [];

  vreq(): Observable<EventPacket> {
    const ch = this.channels.pop();
    if (!ch) {
      throw new Error("No scheduled event stream available.");
    }

    ch.resolve();

    return ch.stream;
  }

  pushNextEventStream(stream: Observable<EventPacket>): Promise<void> {
    const { promise, resolve } = Promise.withResolvers<void>();

    this.channels.push({ stream, resolve });

    return promise;
  }

  eventOut = new Subject<ProgressActivity>();

  event(): Observable<ProgressActivity> {
    return this.eventOut.asObservable();
  }

  sendProgress(): void {}
}
