import type { AuthenticatorInput } from "../../../authenticator/index.ts";
import type { EventVerifier } from "../../../event-verifier/index.ts";
import type { RxNostrReqConfig, RxNostrReqOptions } from "./rx-nostr-req.interface.ts";

export interface RxNostrReqOptionsContext {
  readonly verifier: EventVerifier;
  readonly authenticator: AuthenticatorInput | undefined;
  readonly defaultOptions: Readonly<{ req?: RxNostrReqOptions }>;
  readonly staticDefaultOptions: Readonly<{ req: Required<RxNostrReqOptions> }>;
}

export class FilledRxNostrReqOptions {
  readonly defer: boolean;
  readonly linger: number;
  readonly weak: boolean;
  readonly timeout: number;
  readonly skipExpirationCheck: boolean;
  readonly skipValidateFilterMatching: boolean;
  readonly verifier: EventVerifier;
  readonly authenticator: AuthenticatorInput | undefined;

  constructor(config: RxNostrReqConfig, rootConfig: RxNostrReqOptionsContext) {
    const base = rootConfig.defaultOptions.req;
    const staticBase = rootConfig.staticDefaultOptions.req;

    this.defer = config.defer ?? base?.defer ?? staticBase.defer;
    this.linger = config.linger ?? base?.linger ?? staticBase.linger;
    this.weak = config.weak ?? base?.weak ?? staticBase.weak;
    this.timeout = config.timeout ?? base?.timeout ?? staticBase.timeout;
    this.skipExpirationCheck =
      config.skipExpirationCheck ?? base?.skipExpirationCheck ?? staticBase.skipExpirationCheck;
    this.skipValidateFilterMatching =
      config.skipValidateFilterMatching ??
      base?.skipValidateFilterMatching ??
      staticBase.skipValidateFilterMatching;
    this.verifier = config.verifier ?? rootConfig.verifier;
    this.authenticator =
      config.authenticator === false
        ? undefined
        : (config.authenticator ?? rootConfig.authenticator);
  }
}
