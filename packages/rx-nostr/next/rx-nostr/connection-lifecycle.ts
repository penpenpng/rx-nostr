import { Deferrer } from "../libs/deferrer.ts";
import { RelayMap } from "../libs/relay-urls.ts";
import type { RelayCommunication } from "./relay-communication.ts";

export class ConnectionLifecycle {
  private deferrer = new Deferrer();
  private map = new RelayMap<{
    connected: Promise<void>;
    relay: RelayCommunication;
  }>();
  private defer: boolean;
  private linger: number;
  private weak: boolean;

  constructor(params: { defer: boolean; linger: number; weak: boolean }) {
    this.defer = params.defer;
    this.linger = params.linger;
    this.weak = params.weak;
  }

  async preconnect(relay: RelayCommunication) {
    if (this.weak) {
      return;
    }

    if (this.defer) {
      return;
    }

    const connected = relay.connect();
    this.map.set(relay.url, { connected, relay });

    return connected;
  }

  async connect(relay: RelayCommunication) {
    if (this.weak) {
      return;
    }

    if (this.map.has(relay.url)) {
      return this.map.get(relay.url);
    } else {
      const connected = relay.connect();
      this.map.set(relay.url, { connected, relay });

      return connected;
    }
  }

  release(relay: RelayCommunication) {
    if (this.weak) {
      return;
    }

    if (!Number.isFinite(this.linger)) {
      return;
    }

    this.deferrer.invoke(
      () => {
        this.map.get(relay.url)?.relay.release();
        this.map.delete(relay.url);
      },
      Math.max(0, this.linger),
    );
  }

  cleanup() {
    if (this.weak) {
      return;
    }

    this.deferrer.cancelAll();

    for (const { relay } of this.map.values()) {
      relay.release();
    }
    this.map.clear();
  }
}
