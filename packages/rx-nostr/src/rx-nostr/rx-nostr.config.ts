import { ExponentialBackoffRetryer, type ConnectionRetryer } from "../connection-retryer/index.ts";
import { Nip07Signer, type EventSigner } from "../event-signer/index.ts";
import type { EventVerifier } from "../event-verifier/index.ts";
import { RxNostrInvalidUsageError } from "../libs/error.ts";
import type { WebSocketConstructor } from "../types/index.ts";
import { GlobalRelayDirectory, type RelayDirectory } from "../relay-directory/index.ts";
import type { AuthenticatorInput } from "../authenticator/index.ts";
import type {
  RxNostrConfig,
  RxNostrDefaultOptions,
  RxNostrPublishOptions,
  RxNostrReqOptions,
  RxNostrStaticDefaultOptions,
} from "./rx-nostr.interface.ts";

export const RX_NOSTR_DEFAULT_OPTIONS: RxNostrStaticDefaultOptions = Object.freeze({
  req: Object.freeze({
    defer: true,
    linger: 10_000,
    weak: false,
    timeout: 30_000,
    skipExpirationCheck: false,
    skipValidateFilterMatching: false,
  }),
  publish: Object.freeze({
    linger: 10_000,
    weak: false,
    timeout: 30_000,
  }),
});

export const RX_NOSTR_DEFAULTS = Object.freeze({
  skipFetchNip11: false,
});

export class FilledRxNostrConfig {
  readonly verifier: EventVerifier;
  readonly signer: EventSigner;
  readonly authenticator: AuthenticatorInput | undefined;
  readonly retry: ConnectionRetryer;
  readonly relayDirectory: RelayDirectory;
  readonly skipFetchNip11: boolean;
  readonly WebSocket: WebSocketConstructor | undefined;
  readonly defaultOptions: Readonly<RxNostrDefaultOptions>;
  readonly staticDefaultOptions: Readonly<RxNostrStaticDefaultOptions>;

  constructor(config: RxNostrConfig, staticDefaultOptions: RxNostrStaticDefaultOptions) {
    if (!config.verifier) {
      throw new RxNostrInvalidUsageError("A verifier is required.");
    }

    this.verifier = config.verifier;
    this.staticDefaultOptions = freezeStaticDefaultOptions(staticDefaultOptions);
    this.signer = config.signer ?? this.staticDefaultOptions.publish.signer ?? new Nip07Signer();
    this.authenticator = config.authenticator;
    this.retry = config.retry ?? new ExponentialBackoffRetryer();
    this.relayDirectory = config.relayDirectory ?? GlobalRelayDirectory;
    this.skipFetchNip11 = config.skipFetchNip11 ?? RX_NOSTR_DEFAULTS.skipFetchNip11;
    this.WebSocket = config.WebSocket ?? (globalThis.WebSocket as WebSocketConstructor | undefined);
    this.defaultOptions = freezeDefaultOptions(config.defaultOptions);
  }
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

  constructor(
    config: RxNostrReqOptions & {
      verifier?: EventVerifier;
      authenticator?: AuthenticatorInput | false;
    },
    rootConfig: FilledRxNostrConfig,
  ) {
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

export class FilledRxNostrPublishOptions {
  readonly signer: EventSigner;
  readonly linger: number;
  readonly weak: boolean;
  readonly timeout: number;
  readonly authenticator: AuthenticatorInput | undefined;

  constructor(
    config: RxNostrPublishOptions & {
      authenticator?: AuthenticatorInput | false;
    },
    rootConfig: FilledRxNostrConfig,
  ) {
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

function freezeDefaultOptions(
  options: RxNostrDefaultOptions | undefined,
): Readonly<RxNostrDefaultOptions> {
  return Object.freeze({
    req: options?.req ? Object.freeze({ ...options.req }) : undefined,
    publish: options?.publish ? Object.freeze({ ...options.publish }) : undefined,
  });
}

export function cloneStaticDefaultOptions(
  options: RxNostrStaticDefaultOptions,
): RxNostrStaticDefaultOptions {
  return {
    req: { ...options.req },
    publish: { ...options.publish },
  };
}

function freezeStaticDefaultOptions(
  options: RxNostrStaticDefaultOptions,
): Readonly<RxNostrStaticDefaultOptions> {
  const clone = cloneStaticDefaultOptions(options);
  return Object.freeze({
    req: Object.freeze(clone.req),
    publish: Object.freeze(clone.publish),
  });
}
