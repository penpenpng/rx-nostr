import { Deferrer } from "../libs/deferrer.ts";
import type { RelayCommunication } from "./relay-communication.ts";

export class RefCountLifeCycle {
  private deferrer = new Deferrer();
  private relays = new Set<RelayCommunication>();
  private defer: boolean;
  private linger: number;
  private weak: boolean;

  constructor(params: { defer: boolean; linger: number; weak: boolean }) {
    this.defer = params.defer;
    this.linger = params.linger;
    this.weak = params.weak;
  }

  prepare(relay: RelayCommunication) {
    if (this.weak) {
      return;
    }

    if (!this.defer) {
      relay.addRef();
      this.relays.add(relay);
    }
  }

  begin(relay: RelayCommunication) {
    if (this.weak) {
      return;
    }

    if (this.defer) {
      relay.addRef();
      this.relays.add(relay);
    }
  }

  end(relay: RelayCommunication) {
    if (this.weak) {
      return;
    }

    if (Number.isFinite(this.linger)) {
      this.deferrer.invoke(() => {
        relay.subRef();
        this.relays.delete(relay);
      }, this.linger);
    }
  }

  cleanup() {
    if (this.weak) {
      return;
    }

    if (Number.isFinite(this.linger)) {
      this.deferrer.flushAll();
    } else {
      for (const relay of this.relays) {
        relay.subRef();
      }
      this.relays.clear();
    }
  }
}
