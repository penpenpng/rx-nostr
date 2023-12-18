import Nostr from "nostr-typedef";
import { Observable, Subject } from "rxjs";

import { OkPacket, OkPacketAgainstEvent } from "../packet.js";
import { AuthProxy } from "./auth.js";
import { RelayConnection } from "./relay.js";
import { CounterSubject } from "./utils.js";

export class PublishProxy {
  private relay: RelayConnection;
  private authProxy: AuthProxy | null;
  private pubs = new Map<string, Nostr.Event>();
  private count$ = new CounterSubject(0);
  private ok$ = new Subject<OkPacketAgainstEvent>();
  private disposed = false;

  constructor(params: { relay: RelayConnection; authProxy: AuthProxy | null }) {
    this.relay = params.relay;
    this.authProxy = params.authProxy;

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

    // Handle OKs.
    // If auth is required and it can be done,
    // set a flag on OkPacket and try to resend EVENT after done.
    this.relay.getOKObservable().subscribe(async (packet) => {
      const { eventId, notice } = packet;
      const event = this.pubs.get(eventId);
      if (!event) {
        return;
      }

      if (!this.authProxy || !notice?.startsWith("auth-required:")) {
        this.ok$.next({
          ...packet,
          authProgress: !this.authProxy ? "no-authenticator" : "unneeded",
          done: true,
        });
        this.confirmOK(eventId);
        return;
      }

      this.ok$.next({ ...packet, authProgress: "requesting", done: false });

      let authResult: OkPacket;
      try {
        authResult = await this.authProxy.nextAuth();
      } catch {
        this.ok$.next({ ...packet, authProgress: "timeout", done: true });
        this.confirmOK(eventId);
        return;
      }

      if (authResult.ok) {
        this.sendEVENT(event);
      } else {
        this.ok$.next({ ...packet, authProgress: "failed", done: true });
        this.confirmOK(eventId);
      }
    });
  }

  publish(event: Nostr.Event): void {
    if (this.disposed) {
      return;
    }

    if (!this.pubs.has(event.id)) {
      this.pubs.set(event.id, event);
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

  getOkAgainstEventObservable(): Observable<OkPacketAgainstEvent> {
    return this.ok$.asObservable();
  }

  getLogicalConnectionSizeObservable(): Observable<number> {
    return this.count$.asObservable();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    const subjects = [this.count$, this.ok$];
    for (const sub of subjects) {
      sub.complete();
    }
  }

  private sendEVENT(event: Nostr.Event) {
    this.relay.send(["EVENT", event]);
  }
}
