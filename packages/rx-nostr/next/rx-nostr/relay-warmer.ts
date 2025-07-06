import { type Subscription } from "rxjs";
import { once, type RelayMapOperator, type RelayUrl } from "../libs/index.ts";
import { setDiff } from "../operators/index.ts";
import { RxRelays } from "../rx-relays/index.ts";
import type { RelayCommunication } from "./relay-communication.ts";

export class RelayWarmer {
  private sub?: Subscription;
  private lastValue?: Set<RelayUrl>;

  constructor(private relays: RelayMapOperator<RelayCommunication>) {}

  setHotRelays = (relays: RxRelays | Iterable<string>): void => {
    this.sub?.unsubscribe();
    this.sub = RxRelays.observable(relays)
      .pipe(setDiff({ seed: this.lastValue }))
      .subscribe(({ current, appended, outdated }) => {
        this.lastValue = current;

        this.relays.forEach(appended, (relay) => relay.connect());
        this.relays.forEach(outdated, (relay) => relay.release());
      });
  };

  unsetHotRelays = (): void => {
    this.setHotRelays([]);
  };

  [Symbol.dispose] = once(() => {
    this.sub?.unsubscribe();
    this.relays.forEach(this.lastValue, (relay) => relay.release());
  });
  dispose = this[Symbol.dispose];
}
