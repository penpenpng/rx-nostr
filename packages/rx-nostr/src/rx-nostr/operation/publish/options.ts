import type { EventSigner } from "../../../event-signer/index.ts";
import { assertTimerDuration } from "../../../libs/timing.ts";
import type { RxNostrPublishConfig, RxNostrPublishOptions } from "./rx-nostr-publish.interface.ts";

export interface RxNostrPublishOptionsContext {
  readonly signer: EventSigner;
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

  constructor(config: RxNostrPublishConfig, rootConfig: RxNostrPublishOptionsContext) {
    const base = rootConfig.defaultOptions.publish;
    const staticBase = rootConfig.staticDefaultOptions.publish;

    this.signer = config.signer ?? base?.signer ?? rootConfig.signer;
    this.linger = assertTimerDuration(
      config.linger ?? base?.linger ?? staticBase.linger,
      "publish linger",
      {
        allowZero: true,
        allowInfinity: true,
      },
    );
    this.weak = config.weak ?? base?.weak ?? staticBase.weak;
    this.timeout = assertTimerDuration(
      config.timeout ?? base?.timeout ?? staticBase.timeout,
      "publish timeout",
      {
        allowZero: true,
        allowInfinity: true,
      },
    );
  }
}
