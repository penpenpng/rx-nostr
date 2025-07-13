import { Deferrer, once, RelayMap } from "../libs/index.ts";
import type { IRelayCommunication } from "./relay-communication.ts";

export interface QuerySegment {
  endSegment: () => void;
}

export class QuerySession {
  private defer: boolean;
  private weak: boolean;
  private relays = new RelayMap<QuerySessionPerRelay>();

  constructor(params: { defer: boolean; weak: boolean }) {
    this.defer = params.defer;
    this.weak = params.weak;
  }

  prewarm(relay: IRelayCommunication): void {
    if (this.weak || this.defer) {
      return;
    }

    this.relays.get(relay.url);

    return this.getSessionPerRelay(relay).prewarm();
  }

  beginSegment(relay: IRelayCommunication, linger: number): QuerySegment {
    if (this.weak) {
      return { endSegment: () => {} };
    }

    const endSegment = this.getSessionPerRelay(relay).beginSegment(linger);
    return { endSegment };
  }

  [Symbol.dispose] = once(() => {
    for (const relay of this.relays.values()) {
      relay.dispose();
    }
  });
  dispose = this[Symbol.dispose];

  private getSessionPerRelay(relay: IRelayCommunication) {
    return this.relays.setDefault(
      relay.url,
      () => new QuerySessionPerRelay(relay),
    );
  }
}

class QuerySessionPerRelay {
  private deferrer = new Deferrer();
  private warmed = false;
  private dropPrewarming?: () => void;

  private nextId = 0;
  private undropped = new Map<number, () => void>();

  constructor(private relay: IRelayCommunication) {}

  prewarm(): void {
    if (this.warmed) {
      return;
    }

    this.warmed = true;
    const drop = this.holdLatch();

    this.dropPrewarming = () => {
      drop();
      this.dropPrewarming = undefined;
    };
  }

  beginSegment(linger: number): () => void {
    this.warmed = true;

    if (this.dropPrewarming) {
      return this.lingered(this.dropPrewarming, linger);
    } else {
      const drop = this.holdLatch();
      return this.lingered(drop, linger);
    }
  }

  private holdLatch() {
    const drop = this.relay.latch.hold();

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
