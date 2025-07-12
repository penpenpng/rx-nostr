import { Subject, type Observable } from "rxjs";
import type { RelayUrl } from "../../libs";
import type { EventPacket, ProgressActivity } from "../../packets";
import type { IRelayCommunication } from "../../rx-nostr/relay-communication";

export class RelayCommunicationMock implements IRelayCommunication {
  refs = 0;

  constructor(public url: RelayUrl) {}

  connect(): Promise<void> {
    this.refs++;
    return Promise.resolve();
  }

  release(): void {
    this.refs--;
  }

  eventStreams: Observable<EventPacket>[] = [];

  vreq(): Observable<EventPacket> {
    const stream = this.eventStreams.pop();
    if (!stream) {
      throw new Error("No scheduled event stream available.");
    }

    return stream;
  }

  willRespondEvent(schedule: Observable<EventPacket>): void {
    this.eventStreams.push(schedule);
  }

  eventOut = new Subject<ProgressActivity>();

  event(): Observable<ProgressActivity> {
    return this.eventOut.asObservable();
  }

  sendProgress(): void {}
}
