import {
  ExponentialBackoffRetryer,
  type ConnectionRetryer,
} from "../connection-retryer/index.ts";
import { Nip07Signer, type EventSigner } from "../event-signer/index.ts";
import type { EventVerifier } from "../event-verifier/index.ts";
import { RxNostrInvalidUsageError } from "../libs/error.ts";
import type { WebSocketConstructor } from "../types/index.ts";
import type { AuthenticatorInput } from "../authenticator/index.ts";
import type {
  RxNostrConfig,
  RxNostrDefaultOptions,
  RxNostrPublishOptions,
  RxNostrReqOptions,
} from "./rx-nostr.interface.ts";

const reqDefaults = Object.freeze({
  defer: true,
  linger: 10_000,
  weak: false,
  timeout: 30_000,
  skipExpirationCheck: false,
  skipValidateFilterMatching: false,
});

const publishDefaults = Object.freeze({
  linger: 10_000,
  weak: false,
  timeout: 30_000,
});

export const RX_NOSTR_DEFAULTS = Object.freeze({
  authTimeout: 30_000,
  skipFetchNip11: false,
  req: reqDefaults,
  publish: publishDefaults,
});

export class FilledRxNostrConfig {
  readonly verifier: EventVerifier;
  readonly signer: EventSigner;
  readonly authenticator: AuthenticatorInput | undefined;
  readonly retry: ConnectionRetryer;
  readonly authTimeout: number;
  readonly skipFetchNip11: boolean;
  readonly WebSocket: WebSocketConstructor | undefined;
  readonly defaultOptions: Readonly<RxNostrDefaultOptions>;

  constructor(config: RxNostrConfig) {
    if (!config.verifier) {
      throw new RxNostrInvalidUsageError("A verifier is required.");
    }

    this.verifier = config.verifier;
    this.signer = config.signer ?? new Nip07Signer();
    this.authenticator = config.authenticator;
    this.retry = config.retry ?? new ExponentialBackoffRetryer();
    this.authTimeout = config.authTimeout ?? RX_NOSTR_DEFAULTS.authTimeout;
    this.skipFetchNip11 =
      config.skipFetchNip11 ?? RX_NOSTR_DEFAULTS.skipFetchNip11;
    this.WebSocket =
      config.WebSocket ??
      (globalThis.WebSocket as WebSocketConstructor | undefined);
    this.defaultOptions = Object.freeze({
      req: config.defaultOptions?.req
        ? Object.freeze({ ...config.defaultOptions.req })
        : undefined,
      publish: config.defaultOptions?.publish
        ? Object.freeze({ ...config.defaultOptions.publish })
        : undefined,
    });
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

    this.defer = config.defer ?? base?.defer ?? RX_NOSTR_DEFAULTS.req.defer;
    this.linger = config.linger ?? base?.linger ?? RX_NOSTR_DEFAULTS.req.linger;
    this.weak = config.weak ?? base?.weak ?? RX_NOSTR_DEFAULTS.req.weak;
    this.timeout =
      config.timeout ?? base?.timeout ?? RX_NOSTR_DEFAULTS.req.timeout;
    this.skipExpirationCheck =
      config.skipExpirationCheck ??
      base?.skipExpirationCheck ??
      RX_NOSTR_DEFAULTS.req.skipExpirationCheck;
    this.skipValidateFilterMatching =
      config.skipValidateFilterMatching ??
      base?.skipValidateFilterMatching ??
      RX_NOSTR_DEFAULTS.req.skipValidateFilterMatching;
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

    this.signer = config.signer ?? base?.signer ?? rootConfig.signer;
    this.linger =
      config.linger ?? base?.linger ?? RX_NOSTR_DEFAULTS.publish.linger;
    this.weak = config.weak ?? base?.weak ?? RX_NOSTR_DEFAULTS.publish.weak;
    this.timeout =
      config.timeout ?? base?.timeout ?? RX_NOSTR_DEFAULTS.publish.timeout;
    this.authenticator =
      config.authenticator === false
        ? undefined
        : (config.authenticator ?? rootConfig.authenticator);
  }
}
