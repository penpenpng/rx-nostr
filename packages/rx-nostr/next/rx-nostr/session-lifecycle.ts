import { Deferrer, once, RelayMap } from "../libs/index.ts";
import type { RelayCommunication } from "./relay-communication.ts";

export class SessionLifecycle {
  private deferrer = new Deferrer();
  private segments = new RelayMap<SessionSegment>();
  private prewarmed = new Set<string>();
  private defer: boolean;
  private weak: boolean;

  constructor(params: { defer: boolean; weak: boolean }) {
    this.defer = params.defer;
    this.weak = params.weak;
  }

  /**
   * Invoked only once when the possibility arises that a WebSocket connection is needed.
   * Specifically, it is called synchronously as a result of calling `req().subscribe()` or `event()`.
   *
   * - For non-`defer` connections, the connection attempt is initiated at this phase.
   * - For `weak` connections, no connection attempt is made.
   */
  prewarm(relay: RelayCommunication): void {
    const prewarmed = this.prewarmed.has(relay.url);
    this.prewarmed.add(relay.url);

    if (prewarmed || this.weak || this.defer || this.segments.has(relay.url)) {
      return;
    }

    relay.connect();
    this.segments.set(relay.url, new SessionSegment(relay));
  }

  /**
   * Invoked when the payload to be sent has been fully determined
   * and immediate communication over the WebSocket is required.
   *
   * - For `defer` connections, the connection attempt is initiated at this phase.
   * - For `weak` connections, no connection attempt is made.
   */
  beginSegment(relay: RelayCommunication): void {
    if (this.weak) {
      return;
    }

    const currentSegment = this.segments.get(relay.url);

    if (!currentSegment) {
      relay.connect();
    }

    // Set new segment to cancel mortality of the current segment.
    this.segments.set(relay.url, new SessionSegment(relay));
  }

  /**
   * Invoked when the WebSocket connection is no longer needed.
   *
   * - For `ligner` connections, the connection is released after a specified delay.
   */
  endSegment(relay: RelayCommunication, linger: number): void {
    if (this.weak || !Number.isFinite(linger)) {
      return;
    }

    const mortalSegment = this.segments.get(relay.url);
    if (!mortalSegment) {
      return;
    }

    this.deferrer.invoke(
      () => {
        const currentSegment = this.segments.get(relay.url);
        if (currentSegment === mortalSegment) {
          currentSegment.relay.release();
          this.segments.delete(relay.url);
        }
      },
      Math.max(0, linger),
    );
  }

  [Symbol.dispose] = once(() => {
    if (this.weak) {
      return;
    }

    this.deferrer.cancelAll();

    for (const { relay } of this.segments.values()) {
      relay.release();
    }
    this.segments.clear();
  });
  dispose = this[Symbol.dispose];
}

class SessionSegment {
  constructor(public relay: RelayCommunication) {}
}
