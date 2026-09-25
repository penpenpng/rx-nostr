import { Deferrer, once, RelayMap } from "../../../libs/index.ts";
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

  constructor(params: { defer: boolean; weak: boolean }) {
    this.defer = params.defer;
    this.weak = params.weak;
  }

  prewarm(relay: IRelayCommunication): boolean {
    if (this.weak || this.defer) {
      return false;
    }

    this.relays.get(relay.url);

    return this.getRelayDemand(relay).prewarm();
  }

  openDemandWindow(relay: IRelayCommunication, linger: number): RelayDemandWindow {
    if (this.weak) {
      return { close: once(() => {}) };
    }

    const close = this.getRelayDemand(relay).openDemandWindow(linger);
    return { close: once(close) };
  }

  [Symbol.dispose] = once(() => {
    for (const relay of this.relays.values()) {
      relay.dispose();
    }
  });
  dispose = this[Symbol.dispose];

  private getRelayDemand(relay: IRelayCommunication) {
    return this.relays.setDefault(relay.url, () => new RelayDemand(relay));
  }
}

/** Manages the leases this scope holds for one relay. */
class RelayDemand {
  private deferrer = new Deferrer();
  private warmed = false;
  private releasePrewarming?: () => void;

  private nextLeaseId = 0;
  private activeLeases = new Map<number, () => void>();

  constructor(private relay: IRelayCommunication) {}

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

    this.activeLeases.set(id, release);

    return () => {
      this.activeLeases.delete(id);
      release();
    };
  }

  private releaseAfterLinger(release: () => void, linger: number): () => void {
    if (!Number.isFinite(linger)) {
      return () => {
        // never release the lease
      };
    }

    if (linger <= 0) {
      return release;
    }

    return () => this.deferrer.invoke(release, linger);
  }

  [Symbol.dispose] = once(() => {
    this.deferrer.cancelAll();

    for (const release of this.activeLeases.values()) {
      release();
    }
  });
  dispose = this[Symbol.dispose];
}
