import { NoopVerifier } from "../../event-verifier/index.ts";
import {
  type RxNostrConfig,
  type RxNostrReqOptions,
} from "../../rx-nostr/index.ts";
import {
  FilledRxNostrConfig,
  FilledRxNostrReqOptions,
} from "../../rx-nostr/rx-nostr.config.ts";

export const getTestReqOptions = (config?: RxNostrReqOptions) =>
  new FilledRxNostrReqOptions(config ?? {}, getTestConfig());

export const getTestConfig = (config?: Omit<RxNostrConfig, "verifier">) =>
  new FilledRxNostrConfig({
    verifier: new NoopVerifier(),
    defaultOptions: {
      req: {
        skipExpirationCheck: true,
        skipValidateFilterMatching: true,
      },
    },
    ...config,
  });
