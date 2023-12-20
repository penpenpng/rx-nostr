import Nostr from "nostr-typedef";
import { first, firstValueFrom, map, Observable, Subject, timeout } from "rxjs";

import type { Authenticator, RxNostrConfig } from "../config/index.js";
import { AuthState, AuthStatePacket, OkPacket } from "../packet.js";
import type { RelayConnection } from "./relay.js";

type AuthPhase =
  | {
      state: "no-challenge";
    }
  | {
      state: "ready-for-challenge";
      challenge: string;
    }
  | {
      state: "challenging";
      challenge: string;
      eventId: string;
    }
  | {
      state: "succeeded";
      challenge: string;
      eventId: string;
      result: OkPacket;
    }
  | {
      state: "failed";
      challenge: string;
      eventId: string;
      result: OkPacket;
    };

export class AuthProxy {
  private relay: RelayConnection;
  private config: RxNostrConfig;
  private authenticator: Authenticator;

  private queued = false;

  private phase$ = new Subject<AuthPhase>();
  private _phase: AuthPhase = { state: "no-challenge" };
  private get phase(): AuthPhase {
    return this._phase;
  }
  get state(): AuthState {
    return this.phase.state;
  }
  private setPhase(state: AuthPhase) {
    this._phase = state;
    this.phase$.next(state);
  }

  private disposed = false;

  constructor(params: {
    relay: RelayConnection;
    config: RxNostrConfig;
    authenticator: Authenticator;
  }) {
    this.relay = params.relay;
    this.config = params.config;
    this.authenticator = params.authenticator;

    this.setPhase({ state: "no-challenge" });

    this.signer
      .getPublicKey()
      .then((pubkey) => this.authenticator.store?.get?.(pubkey, this.relay.url))
      .then((challenge) => {
        if (challenge) {
          this.updateChallenge(challenge);
          this.storeChallenge(challenge);
        }
      });

    if (this.authenticator.strategy === "aggressive") {
      this.relay.onConnected = async () => {
        this.challenge();
        await this.nextAuth();
      };
    }

    this.relay.getReconnectedObservable().subscribe(() => {
      if (this.phase.state === "no-challenge") {
        this.setPhase({ state: "no-challenge" });
      } else {
        this.setPhase({
          state: "ready-for-challenge",
          challenge: this.phase.challenge,
        });
      }
    });

    this.relay.getOKObservable().subscribe((result) => {
      const { eventId, ok } = result;
      if (!("eventId" in this.phase) || this.phase.eventId !== eventId) {
        return;
      }

      this.setPhase({
        state: ok ? "succeeded" : "failed",
        eventId,
        challenge: this.phase.challenge,
        result,
      });
    });

    this.relay.getAUTHObservable().subscribe(({ challenge }) => {
      this.updateChallenge(challenge);
      this.storeChallenge(challenge);

      if (this.authenticator.strategy === "aggressive" || this.queued) {
        this.queued = false;
        this.challenge();
      }
    });
  }

  async nextAuth(): Promise<OkPacket> {
    if (this.phase.state === "succeeded") {
      return this.phase.result;
    }
    if (this.authenticator.strategy === "passive") {
      if (this.phase.state === "ready-for-challenge") {
        this.challenge();
      } else {
        this.queued = true;
      }
    }

    return firstValueFrom(
      this.phase$.pipe(
        map((p) => ("result" in p ? p.result : undefined)),
        first((p): p is OkPacket => !!p),
        timeout(this.config.authTimeout)
      )
    );
  }

  getAuthStateObservable(): Observable<AuthStatePacket> {
    return this.phase$.pipe(
      map(({ state }) => ({
        from: this.relay.url,
        state,
      }))
    );
  }

  private async challenge(): Promise<void> {
    if (!("challenge" in this.phase)) {
      return;
    }

    const challenge = this.phase.challenge;
    const event = await this.createAuthEvent(challenge);
    const eventId = event.id;

    this.setPhase({ state: "challenging", challenge, eventId });

    this.relay.send(["AUTH", event]);
  }

  private async createAuthEvent(
    challenge: string
  ): Promise<Nostr.Event<Nostr.Kind.ClientAuthentication>> {
    return this.signer.signEvent({
      kind: 22242,
      content: "",
      tags: [
        ["relay", this.relay.url],
        ["challenge", challenge],
      ],
    });
  }

  private updateChallenge(challenge: string): void {
    if ("challenge" in this.phase && this.phase.challenge === challenge) {
      return;
    }

    this.setPhase({
      state: "ready-for-challenge",
      challenge,
    });
  }

  private async storeChallenge(challenge: string): Promise<void> {
    this.authenticator.store?.save?.(
      await this.signer.getPublicKey(),
      this.relay.url,
      challenge
    );
  }

  private get signer() {
    return this.authenticator.signer ?? this.config.signer;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    const subjects = [this.phase$];
    for (const sub of subjects) {
      sub.complete();
    }
  }
}
