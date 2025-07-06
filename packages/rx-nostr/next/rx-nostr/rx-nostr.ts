import * as Nostr from "nostr-typedef";
import { defer, Observable } from "rxjs";
import type { LazyFilter } from "../lazy-filter/index.ts";
import { once, RelayMapOperator, RxDisposables } from "../libs/index.ts";
import type {
  ConnectionStatePacket,
  EventPacket,
  ProgressPacket,
} from "../packets/index.ts";
import { RxOneshotReq, RxReq } from "../rx-req/index.ts";
import {
  BackwardReqClient,
  EventPublisher,
  ForwardReqClient,
  RelayWarmer,
} from "./modules/index.ts";
import { RelayCommunication } from "./relay-communication.ts";
import {
  FilledRxNostrConfig,
  FilledRxNostrPublishOptions,
  FilledRxNostrReqOptions,
} from "./rx-nostr.config.ts";
import type {
  IRxNostr,
  RelayInput,
  RxNostrConfig,
  RxNostrPublishConfig,
  RxNostrReqConfig,
} from "./rx-nostr.interface.ts";

export class RxNostr implements IRxNostr {
  protected disposables = new RxDisposables();
  protected relays = new RelayMapOperator((url) => new RelayCommunication(url));
  protected config: FilledRxNostrConfig;
  protected publisher: EventPublisher;
  protected warmer: RelayWarmer;

  constructor(config: RxNostrConfig) {
    this.config = new FilledRxNostrConfig(config);

    this.publisher = new EventPublisher(this.relays);
    this.disposables.use(this.publisher);

    this.warmer = new RelayWarmer(this.relays);
    this.disposables.use(this.warmer);
  }

  req(
    arg: RxReq | LazyFilter | Iterable<LazyFilter>,
    { relays, ...options }: RxNostrReqConfig,
  ): Observable<EventPacket> {
    const config = new FilledRxNostrReqOptions(options, this.config);

    const rxReq: RxReq = (() => {
      if (arg instanceof RxReq) {
        return arg;
      } else if (Symbol.iterator in arg) {
        return new RxOneshotReq([...arg]);
      } else {
        return new RxOneshotReq(arg);
      }
    })();

    const client = (() => {
      if (rxReq.strategy === "forward") {
        return new ForwardReqClient(this.relays);
      } else {
        return new BackwardReqClient(this.relays);
      }
    })();

    this.disposables.use(client);

    return defer(() => client.req({ rxReq, relays, config }));
  }

  publish(
    params: Nostr.EventParameters,
    { relays, ...options }: RxNostrPublishConfig,
  ): Observable<ProgressPacket> {
    const config = new FilledRxNostrPublishOptions(options, this.config);

    return this.publisher.publish({ params, relays, config });
  }

  setHotRelays(relays: RelayInput): void {
    this.warmer.setHotRelays(relays);
  }

  unsetHotRelays(): void {
    this.warmer.unsetHotRelays();
  }

  monitorConnectionState(): Observable<ConnectionStatePacket> {}

  [Symbol.dispose] = once(() => {
    this.disposables.dispose();
  });
  dispose = this[Symbol.dispose];
}
