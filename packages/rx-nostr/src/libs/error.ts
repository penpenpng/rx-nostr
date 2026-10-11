/** Base of public rx-nostr errors. Causes use the native ErrorOptions contract. */
export abstract class RxNostrError extends Error {
  override readonly name: string = "RxNostrError";
}

export type RxNostrCallbackKind = "authenticator" | "filter" | "signer" | "verifier";

/** A user-provided callback failed while an operation was running. */
export class RxNostrCallbackError extends RxNostrError {
  override readonly name = "RxNostrCallbackError";
  constructor(
    public readonly callback: RxNostrCallbackKind,
    cause: unknown,
  ) {
    super(`${callback} callback failed.`, { cause });
  }
}

export type RxNostrPublicationErrorCode =
  | "cancelled"
  | "no-relays"
  | "not-all-accepted"
  | "all-failed";

/** A publication's requested all/any success condition cannot be met. */
export class RxNostrPublicationError extends RxNostrError {
  override readonly name = "RxNostrPublicationError";
  /** Detached from internal settlement state; opaque causes retain their original identity. */
  public readonly failures: import("../publication/index.ts").PublicationFailure[];

  constructor(
    public readonly code: RxNostrPublicationErrorCode,
    failures: readonly import("../publication/index.ts").PublicationFailure[] = [],
    options?: ErrorOptions,
  ) {
    super(`Publication failed (${code}).`, options);

    this.failures = failures.map(({ ok, ...failure }) => ({
      ...failure,
      ...(ok === undefined
        ? {}
        : {
            ok: {
              ...ok,
              message: [...ok.message] as typeof ok.message,
            },
          }),
    }));
  }
}

/**
 * This is usually thrown when rx-nostr is used incorrectly (or possibly rx-nostr has a bug).
 * Please fix your program according to the message.
 *
 * Normally, you should not catch the exception.
 */
export class RxNostrInvalidUsageError extends RxNostrError {
  override readonly name = "RxNostrInvalidUsageError";
}

/**
 * This is usually thrown when rx-nostr is used properly
 * but an error occurs due to external environmental causes.
 */
export class RxNostrEnvironmentError extends RxNostrError {
  override readonly name = "RxNostrEnvironmentError";
}

export type RxNostrNip11ErrorCode =
  | "invalid-url"
  | "network"
  | "timeout"
  | "status"
  | "parse"
  | "invalid-response";

/** A NIP-11 request failed before producing a valid relay information object. */
export class RxNostrNip11Error extends RxNostrError {
  override readonly name = "RxNostrNip11Error";

  constructor(
    public readonly code: RxNostrNip11ErrorCode,
    message: string,
    public readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export type RxNostrRelayDirectorySnapshotErrorCode =
  | "invalid-json"
  | "unsupported-version"
  | "invalid-schema";

/** A RelayDirectory snapshot was rejected without applying any records. */
export class RxNostrRelayDirectorySnapshotError extends RxNostrError {
  override readonly name = "RxNostrRelayDirectorySnapshotError";

  constructor(
    public readonly code: RxNostrRelayDirectorySnapshotErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/**
 * This is thrown only by a bug inside rx-nostr.
 *
 * Normally, you should not catch the exception.
 */
export class RxNostrLogicError extends RxNostrError {
  override readonly name = "RxNostrLogicError";
  constructor(options?: ErrorOptions) {
    super("This is rx-nostr's internal bug. Please report to the author of the library.", options);
  }
}

/**
 * This is thrown when you attempt to access a disposed rx-nostr's resource.
 *
 * Normally, you should not catch the exception.
 */
export class RxNostrAlreadyDisposedError extends RxNostrError {
  override readonly name = "RxNostrAlreadyDisposedError";
  constructor(options?: ErrorOptions) {
    super("Attempted to access a disposed resource.", options);
  }
}
