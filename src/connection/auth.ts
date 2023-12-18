import Nostr from "nostr-typedef";
import { firstValueFrom, Subject, timeout } from "rxjs";

import type { Authenticator, RxNostrConfig } from "../config/index.js";
import { OkPacket } from "../packet.js";
import type { RelayConnection } from "./relay.js";

export interface Authentication {
  challenge: string;
  result: OkPacket | undefined;
}

export class AuthProxy {
  private relay: RelayConnection;
  private config: RxNostrConfig;
  private authenticator: Authenticator;
  private auth: Authentication | null = null;
  private challenge$ = new Subject<string>();
  private disposed = false;

  constructor(params: {
    relay: RelayConnection;
    config: RxNostrConfig;
    authenticator: Authenticator;
  }) {
    this.relay = params.relay;
    this.config = params.config;
    this.authenticator = params.authenticator;

    this.pubkey
      .then((pubkey) => this.authenticator.store?.get?.(pubkey, this.relay.url))
      .then((challenge) => {
        if (challenge) {
          this.updateChallenge(challenge);
        }
      });

    if (this.authenticator.strategy === "aggressive") {
      this.relay.onConnected = () => {
        this.challenge();
      };
    }

    // Recovering
    this.relay.getReconnectedObservable().subscribe(() => {
      this.challenge();
    });

    this.relay.getAUTHObservable().subscribe(({ challengeMessage }) => {
      this.updateChallenge(challengeMessage);

      if (this.authenticator.strategy === "aggressive") {
        this.challenge();
      }
    });
  }

  async nextAuth(): Promise<OkPacket> {
    if (this.auth?.result?.ok) {
      return this.auth.result;
    }
    if (this.auth?.challenge && !this.auth?.result) {
      return this.challenge();
    }

    // Wait for new challenge
    await firstValueFrom(
      this.challenge$.pipe(timeout(this.config.authTimeout))
    );

    return this.challenge();
  }

  private async challenge(): Promise<OkPacket> {
    // latestChallenge に基づいてチャレンジを投げる
    // 成功可否を auth にセット
  }

  private createAuthEvent(
    challengeMessage: string
  ): Nostr.Event<Nostr.Kind.ClientAuthentication> {}

  private async updateChallenge(challengeMessage: string): Promise<void> {
    if (this.auth?.challenge === challengeMessage) {
      return;
    }

    this.auth = {
      challenge: challengeMessage,
      result: undefined,
    };
    this.challenge$.next(challengeMessage);

    this.authenticator.store?.save?.(
      await this.pubkey,
      this.relay.url,
      challengeMessage
    );
  }

  private get pubkey() {
    return (this.authenticator.signer ?? this.config.signer).getPublicKey();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    const subjects = [this.challenge$];
    for (const sub of subjects) {
      sub.complete();
    }
  }
}
