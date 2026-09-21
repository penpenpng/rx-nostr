import { type Subscription } from "rxjs";
import { once, type RelayUrl } from "../../libs/index.ts";
import { RxRelays } from "../../rx-relays/index.ts";
import type { RelayInput } from "../../types/index.ts";
import type { IRelayCommunication } from "../relay-communication.ts";
import type { RelayCommunicationCollection } from "../relay-pool.ts";

/** Owns exactly one long-lived lease for every relay in the current hot set. */
export class RelayWarmer {
  readonly #leases = new Map<RelayUrl, () => void>();
  #sub?: Subscription;

  constructor(private readonly relays: RelayCommunicationCollection<IRelayCommunication>) {}

  setHotRelays(relays: RelayInput): void {
    this.#sub?.unsubscribe();
    this.#sub = RxRelays.observable(relays).subscribe((current) => {
      // Acquire first so replacing aliases or sets cannot introduce a gap.
      for (const url of current) {
        if (!this.#leases.has(url)) {
          this.#leases.set(url, this.relays.get(url).hold());
        }
      }
      for (const [url, release] of this.#leases) {
        if (!current.has(url)) {
          release();
          this.#leases.delete(url);
        }
      }
    });
  }

  unsetHotRelays(): void {
    this.setHotRelays([]);
  }

  [Symbol.dispose] = once(() => {
    this.#sub?.unsubscribe();
    for (const release of this.#leases.values()) release();
    this.#leases.clear();
  });
  dispose = this[Symbol.dispose];
}
