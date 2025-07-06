import { SimpleAuthenticator } from "../authenticator/simple-authenticator.ts";
import { NoopRetryer } from "../connection-retryer/index.ts";
import { Nip07Signer } from "../event-signer/index.ts";
import type { EventVerifier } from "../event-verifier/event-verifier.interface.ts";
import type {
  RxNostrConfig,
  RxNostrPublishOptions,
  RxNostrReqOptions,
} from "./rx-nostr.interface.ts";

export class FilledRxNostrConfig {
  constructor(private config: RxNostrConfig) {}

  get verifier() {
    const key = "verifier";
    return this.config[key];
  }
  get signer() {
    const key = "signer";
    return this.config[key] ?? new Nip07Signer();
  }
  get authenticator() {
    const key = "authenticator";
    return this.config[key] ?? new SimpleAuthenticator(this.signer);
  }
  get retry() {
    const key = "retry";
    return this.config[key] ?? new NoopRetryer();
  }
  get authTimeout() {
    const key = "authTimeout";
    return this.config[key] ?? 30 * 1000;
  }
  get skipFetchNip11() {
    const key = "skipFetchNip11";
    return this.config[key] ?? false;
  }
  get WebSocket() {
    const key = "WebSocket";
    return this.config[key] ?? globalThis.WebSocket;
  }
  get defaultOptions() {
    const key = "defaultOptions";
    return this.config[key] ?? {};
  }
}

export class FilledRxNostrReqOptions {
  constructor(
    private config: RxNostrReqOptions & { verifier?: EventVerifier },
    private rootConfig: FilledRxNostrConfig,
  ) {}

  private get base() {
    return this.rootConfig.defaultOptions?.req ?? {};
  }

  get defer() {
    const key = "defer";
    return this.config[key] ?? this.base[key] ?? false;
  }
  get linger() {
    const key = "linger";
    return this.config[key] ?? this.base[key] ?? Number.POSITIVE_INFINITY;
  }
  get weak() {
    const key = "weak";
    return this.config[key] ?? this.base[key] ?? false;
  }
  get timeout() {
    const key = "timeout";
    return this.config[key] ?? this.base[key] ?? 30 * 1000;
  }
  get skipExpirationCheck() {
    const key = "skipExpirationCheck";
    return this.config[key] ?? this.base[key] ?? false;
  }
  get skipValidateFilterMatching() {
    const key = "skipValidateFilterMatching";
    return this.config[key] ?? this.base[key] ?? false;
  }
  get verifier() {
    const key = "verifier";
    return this.config[key] ?? this.rootConfig[key];
  }
}

export class FilledRxNostrPublishOptions {
  constructor(
    private config: RxNostrPublishOptions,
    private rootConfig: FilledRxNostrConfig,
  ) {}

  private get base() {
    return this.rootConfig.defaultOptions?.publish ?? {};
  }

  private get root() {
    return this.rootConfig;
  }

  get signer() {
    const key = "signer";
    return this.config[key] ?? this.base[key] ?? this.root[key];
  }
  get linger() {
    const key = "linger";
    return this.config[key] ?? this.base[key] ?? Number.POSITIVE_INFINITY;
  }
  get weak() {
    const key = "weak";
    return this.config[key] ?? this.base[key] ?? false;
  }
  get timeout() {
    const key = "timeout";
    return this.config[key] ?? this.base[key] ?? 30 * 1000;
  }
}
