import type { AuthenticatorInput } from "../../../authenticator/index.ts";
import type { EventSigner } from "../../../event-signer/index.ts";
import type { RxNostrPublishConfig, RxNostrPublishOptions } from "./rx-nostr-publish.interface.ts";

export interface RxNostrPublishOptionsContext {
  readonly signer: EventSigner;
  readonly authenticator: AuthenticatorInput | undefined;
  readonly defaultOptions: Readonly<{ publish?: RxNostrPublishOptions }>;
  readonly staticDefaultOptions: Readonly<{
    publish: Required<Omit<RxNostrPublishOptions, "signer">>;
  }>;
}

export class FilledRxNostrPublishOptions {
  readonly signer: EventSigner;
  readonly linger: number;
  readonly weak: boolean;
  readonly timeout: number;
  readonly authenticator: AuthenticatorInput | undefined;

  constructor(config: RxNostrPublishConfig, rootConfig: RxNostrPublishOptionsContext) {
    const base = rootConfig.defaultOptions.publish;
    const staticBase = rootConfig.staticDefaultOptions.publish;

    this.signer = config.signer ?? base?.signer ?? rootConfig.signer;
    this.linger = config.linger ?? base?.linger ?? staticBase.linger;
    this.weak = config.weak ?? base?.weak ?? staticBase.weak;
    this.timeout = config.timeout ?? base?.timeout ?? staticBase.timeout;
    this.authenticator =
      config.authenticator === false
        ? undefined
        : (config.authenticator ?? rootConfig.authenticator);
  }
}
