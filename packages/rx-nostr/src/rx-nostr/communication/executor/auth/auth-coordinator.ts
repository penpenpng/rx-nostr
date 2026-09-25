import type { Subscription } from "rxjs";
import { filter, firstValueFrom, take } from "rxjs";
import { DEFAULT_AUTH_TIMEOUT } from "../../../../authenticator/authenticator.defaults.ts";
import type { Authenticator, AuthenticatorInput } from "../../../../authenticator/index.ts";
import { RxNostrCallbackError } from "../../../../libs/error.ts";
import type { RelayUrl } from "../../../../libs/index.ts";
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
  readonly #attempts = new Map<number, AuthenticationAttempt>();
  #challenge?: Readonly<{ value: string; version: number }>;
  #authenticatedVersion?: number;
  #nextVersion = 0;
  #disposed = false;

  constructor(
    private readonly relay: RelayUrl,
    private readonly transport: NostrTransport,
  ) {
    this.#subscriptions.push(
      transport.messages$.subscribe((packet) => {
        if (packet.type !== "AUTH") return;
        if (this.#challenge?.value === packet.challenge) return;
        this.#challenge = Object.freeze({
          value: packet.challenge,
          version: this.#nextVersion++,
        });
      }),
      transport.state$.subscribe((state) => {
        if (state.state !== "connected" && this.#challenge) {
          this.#invalidateChallenge();
        }
      }),
    );
  }

  authenticate(input: AuthenticatorInput | undefined, signal?: AbortSignal): Promise<void> {
    if (this.#disposed || input === undefined) {
      return Promise.reject(new AuthenticationFailure("disabled"));
    }
    const challenge = this.#challenge;
    if (!challenge) {
      return Promise.reject(new AuthenticationFailure("no-challenge"));
    }
    let authenticator: Authenticator | undefined;
    try {
      authenticator = typeof input === "function" ? input(this.relay) : input;
    } catch (cause) {
      return Promise.reject(new RxNostrCallbackError("authenticator", cause));
    }
    if (!authenticator) {
      return Promise.reject(new AuthenticationFailure("disabled"));
    }
    if (this.#authenticatedVersion === challenge.version) {
      return Promise.resolve();
    }

    const shared = this.#attempts.get(challenge.version);
    if (shared) {
      return waitForAttempt(shared, signal, () => this.#abandonAttempt(challenge.version, shared));
    }

    const controller = new AbortController();
    const attempt: AuthenticationAttempt = {
      controller,
      promise: Promise.resolve(),
      settled: false,
      waiters: 0,
    };
    attempt.promise = this.#run(authenticator, challenge, controller.signal)
      .then(() => {
        this.#authenticatedVersion = challenge.version;
      })
      .finally(() => {
        if (this.#attempts.get(challenge.version) === attempt) {
          this.#attempts.delete(challenge.version);
        }
        attempt.settled = true;
      });
    this.#attempts.set(challenge.version, attempt);
    return waitForAttempt(attempt, signal, () => this.#abandonAttempt(challenge.version, attempt));
  }

  #abandonAttempt(version: number, attempt: AuthenticationAttempt): void {
    if (this.#attempts.get(version) === attempt) this.#attempts.delete(version);
  }

  async #run(
    authenticator: Authenticator,
    challenge: Readonly<{ value: string; version: number }>,
    signal: AbortSignal,
  ): Promise<void> {
    const timeout = authenticator.authTimeout ?? DEFAULT_AUTH_TIMEOUT;
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
    if (!packet.ok) throw new AuthenticationFailure("rejected");
  }

  #assertCurrent(
    challenge: Readonly<{ value: string; version: number }>,
    signal: AbortSignal,
  ): void {
    if (
      signal.aborted ||
      this.#disposed ||
      this.#challenge?.version !== challenge.version ||
      this.#challenge.value !== challenge.value
    ) {
      throw new AuthenticationFailure("stale");
    }
  }

  #invalidateChallenge(): void {
    this.#challenge = undefined;
    this.#authenticatedVersion = undefined;
    this.#nextVersion++;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#invalidateChallenge();
    for (const attempt of this.#attempts.values()) attempt.controller.abort();
    for (const subscription of this.#subscriptions.splice(0)) {
      subscription.unsubscribe();
    }
    this.#attempts.clear();
  }
}

interface AuthenticationAttempt {
  readonly controller: AbortController;
  promise: Promise<void>;
  settled: boolean;
  waiters: number;
}

function waitForAttempt(
  attempt: AuthenticationAttempt,
  signal?: AbortSignal,
  onAbandoned?: () => void,
): Promise<void> {
  if (signal?.aborted) {
    if (attempt.waiters === 0 && !attempt.settled) {
      attempt.controller.abort();
      onAbandoned?.();
    }
    return Promise.reject(new AuthenticationFailure("stale"));
  }
  attempt.waiters++;
  return new Promise<void>((resolve, reject) => {
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      signal?.removeEventListener("abort", onAbort);
      attempt.waiters--;
      if (attempt.waiters === 0 && !attempt.settled) {
        attempt.controller.abort();
        onAbandoned?.();
      }
    };
    const onAbort = () => {
      release();
      reject(new AuthenticationFailure("stale"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    void attempt.promise.then(
      () => {
        if (released) return;
        release();
        resolve();
      },
      (error) => {
        if (released) return;
        release();
        reject(error);
      },
    );
  });
}
