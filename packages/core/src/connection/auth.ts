import { Subject } from "rxjs";

import type { Authenticator, RxNostrConfig } from "../config/index.js";
import type { RelayConnection } from "./relay.js";

export class AuthProxy {
  private relay: RelayConnection;
  private config: RxNostrConfig;
  private authenticator: Authenticator;
  private ongoings = new Set<string>();
  private authResult$ = new Subject<boolean>();
  private disposed = false;

  constructor(params: {
    relay: RelayConnection;
    config: RxNostrConfig;
    authenticator: Authenticator;
  }) {
    this.relay = params.relay;
    this.config = params.config;
    this.authenticator = params.authenticator;

    const listenOK = this.relay.getOKObservable().subscribe((result) => {
      const { eventId, ok } = result;

      if (!this.ongoings.has(eventId)) {
        return;
      }

      this.ongoings.delete(eventId);
      this.authResult$.next(ok);

      if (!ok) {
        listenOK.unsubscribe();
        listenAUTH.unsubscribe();
      }
    });

    const listenAUTH = this.relay
      .getAUTHObservable()
      .subscribe(({ challenge }) => {
        this.challenge(challenge);
      });
  }

  getAuthResultObservable() {
    return this.authResult$.asObservable();
  }

  private async challenge(challenge: string): Promise<void> {
    try {
      const event = await this.signer.signEvent({
        kind: 22242,
        content: "",
        tags: [
          ["relay", this.relay.url],
          ["challenge", challenge],
        ],
      });

      this.ongoings.add(event.id);
      this.relay.send(["AUTH", event]);
    } catch {
      // do nothing
    }
  }

  private get signer() {
    return this.authenticator.signer ?? this.config.signer;
  }

  dispose() {
    this[Symbol.dispose]();
  }

  [Symbol.dispose](): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    const subjects = [this.authResult$];
    for (const sub of subjects) {
      sub.complete();
    }
  }
}
