import type * as Nostr from "nostr-typedef";
import { ReplaySubject, type Observer, type Subscription } from "rxjs";
import { RxNostrCallbackError, RxNostrPublicationError } from "../../libs/error.ts";
import { ensureEventFields, type RelayUrl } from "../../libs/index.ts";
import type { OkPacket } from "../../packets/index.ts";
import type {
  Publication,
  PublicationFailure,
  PublicationSettlePolicy,
} from "../../publication/index.ts";
import { RxRelays } from "../../rx-relays/index.ts";
import type { RelayInput } from "../../types/index.ts";
import { QuerySession, type QuerySegment } from "../query-session.ts";
import type { RelayCommunicationCollection } from "../relay-pool.ts";
import { FilledRxNostrPublishOptions } from "../rx-nostr.config.ts";
import { NostrTransportOperationError } from "../transport/index.ts";

export function publish({
  relays,
  params,
  relayInput,
  config,
}: {
  relays: RelayCommunicationCollection;
  params: Nostr.EventParameters;
  relayInput: RelayInput;
  config: FilledRxNostrPublishOptions;
}): PublicationOperation {
  return new PublicationOperation(relays, params, RxRelays.array(relayInput), config);
}

interface RelayDelivery {
  readonly relay: RelayUrl;
  state: "pending" | "accepted" | "failed";
  lastOk?: OkPacket;
  failure?: PublicationFailure;
  segment?: QuerySegment;
  subscription?: Subscription;
}

interface SettlementWaiter {
  readonly policy: PublicationSettlePolicy;
  readonly resolve: () => void;
  readonly reject: (reason: unknown) => void;
}

export class PublicationOperation implements Publication, Disposable {
  readonly event: Promise<Nostr.Event>;
  readonly closed: Promise<void>;

  readonly #okPackets = new ReplaySubject<OkPacket>();
  readonly #session: QuerySession;
  readonly #deliveries = new Map<RelayUrl, RelayDelivery>();
  readonly #waiters = new Set<SettlementWaiter>();
  readonly #resolveEvent: (event: Nostr.Event) => void;
  readonly #rejectEvent: (error: unknown) => void;
  readonly #resolveClosed: () => void;
  #operationError?: unknown;
  #cancelled = false;
  #terminal = false;
  #cleaned = false;
  #cleanupTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly relays: RelayCommunicationCollection,
    params: Nostr.EventParameters,
    destinations: readonly RelayUrl[],
    private readonly config: FilledRxNostrPublishOptions,
  ) {
    let resolveEvent!: (event: Nostr.Event) => void;
    let rejectEvent!: (error: unknown) => void;
    this.event = new Promise((resolve, reject) => {
      resolveEvent = resolve;
      rejectEvent = reject;
    });
    this.#resolveEvent = resolveEvent;
    this.#rejectEvent = rejectEvent;
    void this.event.catch(() => {});

    let resolveClosed!: () => void;
    this.closed = new Promise((resolve) => {
      resolveClosed = resolve;
    });
    this.#resolveClosed = resolveClosed;

    this.#session = new QuerySession({ defer: false, weak: config.weak });
    for (const relay of destinations) {
      this.#deliveries.set(relay, { relay, state: "pending" });
    }

    if (destinations.length === 0) {
      const error = new RxNostrPublicationError("no-relays");
      this.#rejectEvent(error);
      this.#failOperation(error, false);
      return;
    }

    this.relays.forEach(destinations, (relay) => this.#session.prewarm(relay));

    let signed: Promise<Nostr.Event>;
    try {
      signed = config.signer.signEvent(params);
    } catch (cause) {
      this.#signingFailed(cause);
      return;
    }
    void Promise.resolve(signed).then(
      (event) => this.#signed(event),
      (cause) => this.#signingFailed(cause),
    );
  }

  subscribe(observer?: Partial<Observer<OkPacket>>): Subscription;
  subscribe(
    next?: ((value: OkPacket) => void) | null,
    error?: ((error: unknown) => void) | null,
    complete?: (() => void) | null,
  ): Subscription;
  subscribe(
    observerOrNext?: Partial<Observer<OkPacket>> | ((value: OkPacket) => void) | null,
    error?: ((error: unknown) => void) | null,
    complete?: (() => void) | null,
  ): Subscription {
    if (typeof observerOrNext === "function" || observerOrNext == null) {
      return this.#okPackets.subscribe(observerOrNext, error, complete);
    }
    return this.#okPackets.subscribe(observerOrNext);
  }

  waitFor(policy: PublicationSettlePolicy): Promise<void> {
    return new Promise((resolve, reject) => {
      const waiter = { policy, resolve, reject } satisfies SettlementWaiter;
      if (!this.#settle(waiter)) this.#waiters.add(waiter);
    });
  }

  cancel(): void {
    if (this.#cancelled || this.#cleaned) return;
    this.#cancelled = true;
    const failures: PublicationFailure[] = [];
    for (const delivery of this.#deliveries.values()) {
      if (delivery.state !== "pending") continue;
      delivery.subscription?.unsubscribe();
      delivery.segment?.endSegment();
      const failure = Object.freeze({
        relay: delivery.relay,
        kind: "cancelled" as const,
      });
      delivery.failure = failure;
      delivery.state = "failed";
      failures.push(failure);
    }
    if (failures.length > 0) {
      this.#operationError = new RxNostrPublicationError("cancelled", failures);
      this.#settleWaiters();
      this.#finishPacketStream();
    }
    this.#cleanupNow();
  }

  [Symbol.dispose] = () => this.cancel();

  #signed(event: unknown): void {
    let snapshot: Readonly<Nostr.Event>;
    try {
      snapshot = snapshotEvent(event);
    } catch (cause) {
      this.#signingFailed(cause);
      return;
    }
    this.#resolveEvent(cloneEvent(snapshot));
    if (this.#cancelled || this.#cleaned) return;

    for (const delivery of this.#deliveries.values()) {
      if (delivery.state !== "pending") continue;
      const relay = this.relays.get(delivery.relay);
      delivery.segment = this.#session.beginSegment(relay, this.config.linger);
      delivery.subscription = relay
        .event(snapshot as Nostr.Event, {
          authenticator: this.config.authenticator,
          timeout: this.config.timeout,
        })
        .subscribe({
          next: (packet) => {
            delivery.lastOk = packet;
            this.#okPackets.next(packet);
          },
          complete: () => this.#completeRelay(delivery),
          error: (error) => this.#failRelay(delivery, failureFrom(error, delivery)),
        });
    }
  }

  #signingFailed(cause: unknown): void {
    const error =
      cause instanceof RxNostrCallbackError && cause.callback === "signer"
        ? cause
        : new RxNostrCallbackError("signer", cause);
    this.#rejectEvent(error);
    this.#failOperation(error, true);
  }

  #completeRelay(delivery: RelayDelivery): void {
    if (delivery.state !== "pending") return;
    if (delivery.lastOk?.ok) {
      delivery.state = "accepted";
      this.#finishRelay(delivery);
      return;
    }
    this.#failRelay(
      delivery,
      Object.freeze({
        relay: delivery.relay,
        kind: delivery.lastOk ? "rejected" : "dropped",
        ...(delivery.lastOk ? { ok: delivery.lastOk } : {}),
      }),
    );
  }

  #failRelay(delivery: RelayDelivery, failure: PublicationFailure): void {
    if (delivery.state !== "pending") return;
    delivery.failure = failure;
    delivery.state = "failed";
    this.#finishRelay(delivery);
  }

  #finishRelay(delivery: RelayDelivery): void {
    delivery.subscription?.unsubscribe();
    delivery.segment?.endSegment();
    this.#settleWaiters();
    if ([...this.#deliveries.values()].every((item) => item.state !== "pending")) {
      this.#finishPacketStream();
      this.#scheduleNaturalCleanup();
    }
  }

  #failOperation(error: unknown, emitError: boolean): void {
    if (this.#terminal) return;
    this.#operationError = error;
    for (const delivery of this.#deliveries.values()) {
      delivery.subscription?.unsubscribe();
      delivery.segment?.endSegment();
    }
    this.#settleWaiters();
    this.#terminal = true;
    if (emitError) this.#okPackets.error(error);
    else this.#okPackets.complete();
    this.#cleanupNow();
  }

  #finishPacketStream(): void {
    if (this.#terminal) return;
    this.#terminal = true;
    this.#okPackets.complete();
  }

  #settleWaiters(): void {
    for (const waiter of [...this.#waiters]) {
      if (this.#settle(waiter)) this.#waiters.delete(waiter);
    }
  }

  #settle(waiter: SettlementWaiter): boolean {
    if (this.#operationError !== undefined) {
      waiter.reject(this.#operationError);
      return true;
    }
    const deliveries = [...this.#deliveries.values()];
    if (waiter.policy === "all") {
      if (deliveries.some((delivery) => delivery.state === "failed")) {
        waiter.reject(new RxNostrPublicationError("not-all-accepted", failures(deliveries)));
        return true;
      }
      if (deliveries.every((delivery) => delivery.state === "accepted")) {
        waiter.resolve();
        return true;
      }
      return false;
    }
    if (deliveries.some((delivery) => delivery.state === "accepted")) {
      waiter.resolve();
      return true;
    }
    if (deliveries.every((delivery) => delivery.state === "failed")) {
      waiter.reject(new RxNostrPublicationError("all-failed", failures(deliveries)));
      return true;
    }
    return false;
  }

  #scheduleNaturalCleanup(): void {
    if (this.#cleaned || this.#cancelled) return;
    if (!Number.isFinite(this.config.linger)) return;
    const delay = Math.max(0, this.config.linger);
    if (delay === 0) {
      this.#cleanupNow();
      return;
    }
    this.#cleanupTimer = setTimeout(() => this.#cleanupNow(), delay);
  }

  #cleanupNow(): void {
    if (this.#cleaned) return;
    this.#cleaned = true;
    if (this.#cleanupTimer !== undefined) clearTimeout(this.#cleanupTimer);
    this.#cleanupTimer = undefined;
    for (const delivery of this.#deliveries.values()) {
      delivery.subscription?.unsubscribe();
    }
    this.#session.dispose();
    this.#resolveClosed();
  }
}

function snapshotEvent(value: unknown): Readonly<Nostr.Event> {
  if (typeof value !== "object" || value === null || !ensureEventFields(value)) {
    throw new TypeError("The signer did not return a valid Nostr event.");
  }
  const event = value as Nostr.Event;
  const tags = event.tags.map((tag) => Object.freeze([...tag])) as Nostr.Tag.Any[];
  Object.freeze(tags);
  return Object.freeze({ ...event, tags });
}

function cloneEvent(event: Readonly<Nostr.Event>): Nostr.Event {
  return {
    ...event,
    tags: event.tags.map((tag) => [...tag]) as Nostr.Tag.Any[],
  };
}

function failureFrom(error: unknown, delivery: RelayDelivery): PublicationFailure {
  if (error instanceof RxNostrCallbackError) {
    return Object.freeze({
      relay: delivery.relay,
      kind: "auth" as const,
      cause: error,
      ...(delivery.lastOk ? { ok: delivery.lastOk } : {}),
    });
  }
  if (error instanceof NostrTransportOperationError) {
    const kind =
      error.reason === "timeout"
        ? "timeout"
        : error.reason === "open-error"
          ? "retry-exhausted"
          : "dropped";
    return Object.freeze({ relay: delivery.relay, kind, cause: error });
  }
  return Object.freeze({
    relay: delivery.relay,
    kind: "failed" as const,
    cause: error,
  });
}

function failures(deliveries: readonly RelayDelivery[]): PublicationFailure[] {
  return deliveries.flatMap((delivery) => (delivery.failure ? [delivery.failure] : []));
}
