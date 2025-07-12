import * as Nostr from "nostr-typedef";
import { defer, identity, Observable } from "rxjs";
import type { LazyFilter } from "../lazy-filter/index.ts";
import { once, RelayMapOperator, RxDisposableStack } from "../libs/index.ts";
import { dropExpiredEvents, verify } from "../operators/index.ts";
import type {
  ConnectionStatePacket,
  EventPacket,
  ProgressPacket,
} from "../packets/index.ts";
import { RxOneshotReq, RxReq } from "../rx-req/index.ts";
import {
  publish,
  RelayWarmer,
  reqBackward,
  reqForward,
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
  protected stack = new RxDisposableStack();
  protected relays = new RelayMapOperator((url) => new RelayCommunication(url));
  protected config: FilledRxNostrConfig;
  protected warmer: RelayWarmer;

  constructor(config: RxNostrConfig) {
    this.config = new FilledRxNostrConfig(config);

    this.warmer = new RelayWarmer(this.relays);
    this.stack.use(this.warmer);
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

    const req = (() => {
      if (rxReq.strategy === "forward") {
        return reqForward;
      } else {
        return reqBackward;
      }
    })();

    return defer(() =>
      req({
        rxReq,
        config,
        relayInput: relays,
        relays: this.relays,
      }).pipe(
        verify(options.verifier ?? this.config.verifier),
        options.skipExpirationCheck ? identity : dropExpiredEvents(),
      ),
    );
  }

  publish(
    params: Nostr.EventParameters,
    { relays, ...options }: RxNostrPublishConfig,
  ): Observable<ProgressPacket> {
    const config = new FilledRxNostrPublishOptions(options, this.config);

    return publish({
      params,
      config,
      relayInput: relays,
      relays: this.relays,
    });
  }

  setHotRelays(relays: RelayInput): void {
    this.warmer.setHotRelays(relays);
  }

  unsetHotRelays(): void {
    this.warmer.unsetHotRelays();
  }

  monitorConnectionState(): Observable<ConnectionStatePacket> {}

  [Symbol.dispose] = once(() => {
    this.stack.dispose();
  });
  dispose = this[Symbol.dispose];
}
