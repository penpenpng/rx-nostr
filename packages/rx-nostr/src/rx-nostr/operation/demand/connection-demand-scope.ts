import { Deferrer, once, RelayMap } from "../../../libs/index.ts";
import { assertTimerDuration } from "../../../libs/timing.ts";
import type { IRelayCommunication } from "../../communication/index.ts";

/** The time-bounded connection demand for one relay-local vreq. */
export interface RelayDemandWindow {
  close: () => void;
}

/**
 * Owns connection demand for one operation without owning its protocol work.
 *
 * A query or publication uses this scope to hold per-relay leases while its
 * vreqs run, optionally warming connections first and releasing them after
 * their configured linger period.
 */
export class ConnectionDemandScope {
  private defer: boolean;
  private weak: boolean;
  private relays = new RelayMap<RelayDemand>();
  private finished = false;
  private readonly onDrained: () => void;

  constructor(params: { defer: boolean; weak: boolean }, onDrained = () => {}) {
    this.defer = params.defer;
    this.weak = params.weak;
    this.onDrained = once(onDrained);
  }

  /** Stop prewarming while allowing already closed windows to finish lingering. */
  finish(): void {
    this.finished = true;

    for (const relay of this.relays.values()) {
      relay.releasePrewarm();
    }

    this.checkDrained();
  }

  releasePrewarm(relay: IRelayCommunication): void {
    this.relays.get(relay.url)?.releasePrewarm();
  }

  private checkDrained(): void {
    if (this.finished && [...this.relays.values()].every((relay) => relay.idle)) {
      this.onDrained();
    }
  }

  prewarm(relay: IRelayCommunication): boolean {
    if (this.weak || this.defer) {
      return false;
    }

    this.relays.get(relay.url);

    return this.getRelayDemand(relay).prewarm();
  }

  openDemandWindow(relay: IRelayCommunication, linger: number): RelayDemandWindow {
    assertTimerDuration(linger, "linger", { allowZero: true, allowInfinity: true });

    if (this.weak) {
      return { close: once(() => {}) };
    }

    const close = this.getRelayDemand(relay).openDemandWindow(linger);

    return { close: once(close) };
  }

  /** Release every owned lease now; transport close acknowledgement is asynchronous. */
  [Symbol.dispose] = once(() => {
    this.finished = true;

    for (const relay of this.relays.values()) {
      relay.dispose();
    }

    this.checkDrained();
  });
  dispose = this[Symbol.dispose];

  private getRelayDemand(relay: IRelayCommunication) {
    return this.relays.setDefault(
      relay.url,
      () => new RelayDemand(relay, () => this.checkDrained()),
    );
  }
}

/** Manages the leases this scope holds for one relay. */
class RelayDemand {
  private deferrer = new Deferrer();
  private disposed = false;
  private warmed = false;
  private releasePrewarming?: () => void;

  private nextLeaseId = 0;
  private activeLeases = new Map<number, () => void>();

  constructor(
    private relay: IRelayCommunication,
    private onRelease: () => void,
  ) {}

  get idle(): boolean {
    return this.activeLeases.size === 0;
  }

  releasePrewarm(): void {
    if (this.releasePrewarming) {
      this.warmed = false;
    }

    this.releasePrewarming?.();

    this.releasePrewarming = undefined;
  }

  prewarm(): boolean {
    if (this.warmed) {
      return false;
    }

    this.warmed = true;
    this.releasePrewarming = this.acquireLease();

    return true;
  }

  openDemandWindow(linger: number): () => void {
    this.warmed = true;

    if (this.releasePrewarming) {
      const release = this.releasePrewarming;

      this.releasePrewarming = undefined;

      return this.releaseAfterLinger(release, linger);
    } else {
      const release = this.acquireLease();

      return this.releaseAfterLinger(release, linger);
    }
  }

  private acquireLease() {
    const release = this.relay.hold();

    const id = this.nextLeaseId;

    this.nextLeaseId++;

    const releaseOnce = once(() => {
      this.activeLeases.delete(id);
      release();
      this.onRelease();
    });

    this.activeLeases.set(id, releaseOnce);

    return releaseOnce;
  }

  private releaseAfterLinger(release: () => void, linger: number): () => void {
    if (linger === Infinity) {
      return () => {
        // never release the lease
      };
    }

    if (linger <= 0) {
      return release;
    }

    return () => {
      if (!this.disposed) {
        this.deferrer.invoke(release, linger);
      }
    };
  }

  [Symbol.dispose] = once(() => {
    this.disposed = true;

    this.deferrer.cancelAll();

    for (const release of this.activeLeases.values()) {
      release();
    }
  });
  dispose = this[Symbol.dispose];
}
