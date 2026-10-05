import type { Subscription } from "rxjs";
import { filter, firstValueFrom, take } from "rxjs";

import { DEFAULT_AUTH_TIMEOUT } from "../../../../authenticator/authenticator.defaults.ts";
import type { Authenticator, AuthenticatorInput } from "../../../../authenticator/index.ts";
import { RxNostrCallbackError } from "../../../../libs/error.ts";
import type { RelayUrl } from "../../../../libs/index.ts";
import { assertTimerDuration } from "../../../../libs/timing.ts";
import type { OkPacket } from "../../../../packets/index.ts";
import type { NostrTransport } from "../../transport/index.ts";

export type AuthenticationFailureReason =
  | "disabled"
  | "no-challenge"
  | "rejected"
  | "stale"
  | "transport";

export class AuthenticationFailure extends Error {
  override readonly name = "AuthenticationFailure";

  constructor(
    public readonly reason: AuthenticationFailureReason,
    options?: ErrorOptions,
  ) {
    super(`Relay authentication failed (${reason}).`, options);
  }
}

/** Coordinates NIP-42 authentication for one relay connection. */
export class AuthCoordinator {
  readonly #subscriptions: Subscription[] = [];
  #challenge?: Readonly<{ value: string; version: number }>;
  #status: "unstarted" | "pending" | "authenticated" | "failed" = "unstarted";
  #result?: Promise<void>;
  #controller?: AbortController;
  #failure?: unknown;
  #nextVersion = 0;
  #disposed = false;

  constructor(
    private readonly relay: RelayUrl,
    private readonly transport: NostrTransport,
    private readonly input?: AuthenticatorInput,
  ) {
    this.#subscriptions.push(
      transport.messages$.subscribe((packet) => {
        if (packet.type !== "AUTH" || this.#challenge?.value === packet.challenge) {
          return;
        }

        this.#invalidateChallenge();

        this.#challenge = Object.freeze({ value: packet.challenge, version: this.#nextVersion++ });

        if (this.input !== undefined) {
          void this.#start().catch(() => {});
        }
      }),
      transport.state$.subscribe((state) => {
        if (state.state !== "connected") {
          this.#invalidateChallenge();
        }
      }),
    );
  }

  #start(): Promise<void> {
    if (this.#disposed || this.input === undefined) {
      return Promise.reject(new AuthenticationFailure("disabled"));
    }

    const challenge = this.#challenge;

    if (!challenge) {
      return Promise.reject(new AuthenticationFailure("no-challenge"));
    }
    if (this.#status === "authenticated") {
      return Promise.resolve();
    }
    if (this.#status === "failed") {
      return Promise.reject(this.#failure);
    }
    if (this.#result) {
      return this.#result;
    }

    const controller = new AbortController();

    this.#controller = controller;
    this.#status = "pending";
    this.#result = Promise.resolve()
      .then(() => {
        this.#assertCurrent(challenge, controller.signal);
        let authenticator: Authenticator | undefined;

        try {
          authenticator = typeof this.input === "function" ? this.input(this.relay) : this.input;
        } catch (cause) {
          throw new RxNostrCallbackError("authenticator", cause);
        }

        if (!authenticator) {
          throw new AuthenticationFailure("disabled");
        }

        return abortable(this.#run(authenticator, challenge, controller.signal), controller.signal);
      })
      .then(
        () => {
          this.#assertCurrent(challenge, controller.signal);

          this.#status = "authenticated";
        },
        (error) => {
          if (this.#challenge?.version === challenge.version) {
            this.#status = "failed";
            this.#failure = error;
          }

          throw error;
        },
      );

    return this.#result;
  }

  waitBeforeSend(signal: AbortSignal): Promise<void> | undefined {
    if (this.#status !== "pending") {
      return undefined;
    }

    return this.#waitPending(signal);
  }

  async #waitPending(signal: AbortSignal): Promise<void> {
    while (this.#status === "pending") {
      try {
        await abortable(this.#result!, signal);
      } catch {
        if (signal.aborted) {
          throw new AuthenticationFailure("stale");
        }
      }
    }

    if (signal.aborted) {
      throw new AuthenticationFailure("stale");
    }
  }

  async authenticate(signal?: AbortSignal): Promise<void> {
    for (;;) {
      const version = this.#challenge?.version;

      try {
        await abortable(this.#start(), signal);
      } catch (error) {
        if (signal?.aborted || this.#challenge?.version === version || !this.#challenge) {
          throw error;
        }

        continue;
      }

      if (this.#challenge?.version === version) {
        return;
      }
    }
  }

  async #run(
    authenticator: Authenticator,
    challenge: Readonly<{ value: string; version: number }>,
    signal: AbortSignal,
  ): Promise<void> {
    const timeout = authenticator.authTimeout ?? DEFAULT_AUTH_TIMEOUT;

    assertTimerDuration(timeout, "authTimeout", { allowZero: true, allowInfinity: true });

    let event;

    try {
      event = await authenticator.challenge(this.relay, challenge.value);
    } catch (cause) {
      throw new RxNostrCallbackError("authenticator", cause);
    }
    this.#assertCurrent(challenge, signal);

    let packet: OkPacket;

    try {
      packet = await firstValueFrom(
        this.transport
          .subscribe({
            query: ["AUTH", event],
            selector: (packet) => packet.type === "OK" && packet.eventId === event.id,
            ...(Number.isFinite(timeout)
              ? {
                  timeout: timeout === 0 ? Number.MIN_VALUE : timeout,
                }
              : {}),
            signal,
            retry: "fail",
          })
          .pipe(
            filter((packet): packet is OkPacket => packet.type === "OK"),
            take(1),
          ),
      );
    } catch (cause) {
      throw new AuthenticationFailure("transport", { cause });
    }
    this.#assertCurrent(challenge, signal);

    if (!packet.ok) {
      throw new AuthenticationFailure("rejected");
    }
  }

  #assertCurrent(
    challenge: Readonly<{ value: string; version: number }>,
    signal: AbortSignal,
  ): void {
    if (signal.aborted || this.#disposed || this.#challenge?.version !== challenge.version) {
      throw new AuthenticationFailure("stale");
    }
  }

  #invalidateChallenge(): void {
    this.#controller?.abort();

    this.#controller = undefined;
    this.#challenge = undefined;
    this.#result = undefined;
    this.#failure = undefined;
    this.#status = "unstarted";

    this.#nextVersion++;
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }

    this.#disposed = true;

    this.#invalidateChallenge();

    for (const subscription of this.#subscriptions.splice(0)) {
      subscription.unsubscribe();
    }
  }
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise;
  }
  if (signal.aborted) {
    return Promise.reject(new AuthenticationFailure("stale"));
  }

  return new Promise((resolve, reject) => {
    const abort = () => reject(new AuthenticationFailure("stale"));

    signal.addEventListener("abort", abort, { once: true });
    void promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
