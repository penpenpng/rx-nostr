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

  attachNextEventStream(stream: Observable<EventPacket>): Promise<void> {
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

export function attachNextStream(relay: RelayCommunicationMock) {
  const stream = new Subject<EventPacket>();
  const popped = relay.attachNextEventStream(stream);

  const { promise, resolve, reject } = Promise.withResolvers<void>();

  const timer = setTimeout(() => {
    reject(new Error(`Stream was not subscribed (${relay.url})`));
  }, 100);
  popped.then(() => {
    clearTimeout(timer);
    resolve();
  });

  // Emit EventPacket to the stream to emulate relay response.
  return Object.assign(stream, { ready: promise });
}
