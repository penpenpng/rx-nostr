import Nostr from "nostr-typedef";
import { Observable } from "rxjs";

import { RelayConnection } from "./relay.js";
import { CounterSubject } from "./util.js";

export class PublishProxy {
  private pubs: Set<string> = new Set();
  private count$ = new CounterSubject(0);
  private disposed = false;

  constructor(private relay: RelayConnection) {
    // Recovering
    this.relay.getReconnectedObservable().subscribe((toRelayMessage) => {
      for (const [type, event] of toRelayMessage) {
        if (type !== "EVENT") {
          continue;
        }

        if (this.pubs.has(event.id)) {
          this.sendEVENT(event);
        }
      }
    });
  }

  publish(event: Nostr.Event<number>): void {
    if (this.disposed) {
      return;
    }

    if (!this.pubs.has(event.id)) {
      this.pubs.add(event.id);
      this.count$.increment();
    }

    this.sendEVENT(event);
  }

  confirmOK(eventId: string): void {
    if (this.disposed) {
      return;
    }

    if (!this.pubs.has(eventId)) {
      this.pubs.delete(eventId);
      this.count$.decrement();
    }
  }

  getLogicalConnectionSizeObservable(): Observable<number> {
    return this.count$.asObservable();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    this.count$.complete();
    this.count$.unsubscribe();
  }

  private sendEVENT(event: Nostr.Event) {
    this.relay.send(["EVENT", event]);
  }
}
