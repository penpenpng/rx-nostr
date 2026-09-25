import { Deferrer, once, RelayMap } from "../libs/index.ts";
import type { IRelayCommunication } from "./relay-communication.ts";

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
  private dropPrewarming?: () => void;

  private nextId = 0;
  private undropped = new Map<number, () => void>();

  constructor(private relay: IRelayCommunication) {}

  prewarm(): boolean {
    if (this.warmed) {
      return false;
    }

    this.warmed = true;
    this.dropPrewarming = this.holdLatch();
    return true;
  }

  openDemandWindow(linger: number): () => void {
    this.warmed = true;

    if (this.dropPrewarming) {
      const drop = this.dropPrewarming;
      this.dropPrewarming = undefined;
      return this.lingered(drop, linger);
    } else {
      const drop = this.holdLatch();
      return this.lingered(drop, linger);
    }
  }

  private holdLatch() {
    const drop = this.relay.hold();

    const id = this.nextId;
    this.nextId++;

    this.undropped.set(id, drop);

    return () => {
      this.undropped.delete(id);
      drop();
    };
  }

  private lingered(drop: () => void, linger: number): () => void {
    if (!Number.isFinite(linger)) {
      return () => {
        // never drop the latch
      };
    }

    if (linger <= 0) {
      // drop immediately
      return drop;
    }

    // drop after linger
    return () => this.deferrer.invoke(drop, linger);
  }

  [Symbol.dispose] = once(() => {
    this.deferrer.cancelAll();

    for (const drop of this.undropped.values()) {
      drop();
    }
  });
  dispose = this[Symbol.dispose];
}
