export abstract class RxNostrError extends Error {}

export type RxNostrCallbackKind = "authenticator" | "filter" | "signer" | "verifier";

/** A user-provided callback failed while an operation was running. */
export class RxNostrCallbackError extends RxNostrError {
  constructor(
    public readonly callback: RxNostrCallbackKind,
    cause: unknown,
  ) {
    super(`RxNostrCallbackError: ${callback} callback failed.`, { cause });
    this.name = "RxNostrCallbackError";
  }
}

export type RxNostrPublicationErrorCode =
  | "cancelled"
  | "no-relays"
  | "not-all-accepted"
  | "all-failed";

/** A publication's requested all/any success condition cannot be met. */
export class RxNostrPublicationError extends RxNostrError {
  public readonly failures: import("../publication/index.ts").PublicationFailure[];

  constructor(
    public readonly code: RxNostrPublicationErrorCode,
    failures: readonly import("../publication/index.ts").PublicationFailure[] = [],
  ) {
    super(`RxNostrPublicationError: publication failed (${code}).`);
    this.name = "RxNostrPublicationError";
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
 * This is thrown when WebSocket connection is closed unexpectedly.
 * You may see them in a stream made by `rxNostr.createAllErrorObservable()`.
 */
export class RxNostrWebSocketError extends RxNostrError {
  constructor(public code?: number) {
    super(`RxNostrWebSocketError: WebSocket was closed with code ${code} by relay.`);
    this.name = "RxNostrWebSocketError";
  }
}

/**
 * This is usually thrown when rx-nostr is used incorrectly (or possibly rx-nostr has a bug).
 * Please fix your program according to the message.
 *
 * Normally, you should not catch the exception.
 */
export class RxNostrInvalidUsageError extends RxNostrError {
  constructor(message: string) {
    super(`RxNostrInvalidUsageError: ${message}`);
    this.name = "RxNostrInvalidUsageError";
  }
}

/**
 * This is usually thrown when rx-nostr is used properly
 * but an error occurs due to external environmental causes.
 */
export class RxNostrEnvironmentError extends RxNostrError {
  constructor(message: string) {
    super(`RxNostrEnvironmentError: ${message}`);
    this.name = "RxNostrEnvironmentError";
  }
}

export type RxNostrNip11ErrorCode =
  | "invalid-url"
  | "network"
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
    super(`RxNostrNip11Error: ${message}`, options);
  }
}

export type RelayDirectorySnapshotErrorCode =
  | "invalid-json"
  | "unsupported-version"
  | "invalid-schema";

/** A RelayDirectory snapshot was rejected without applying any records. */
export class RelayDirectorySnapshotError extends RxNostrError {
  override readonly name = "RelayDirectorySnapshotError";

  constructor(
    public readonly code: RelayDirectorySnapshotErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(`RelayDirectorySnapshotError: ${message}`, options);
  }
}

/**
 * This is thrown only by a bug inside rx-nostr.
 *
 * Normally, you should not catch the exception.
 */
export class RxNostrLogicError extends RxNostrError {
  constructor() {
    super(
      "RxNostrLogicError: This is rx-nostr's internal bug. Please report to the author of the library.",
    );
    this.name = "RxNostrLogicError";
  }
}

/**
 * This is thrown when you attempt to access a disposed rx-nostr's resource.
 *
 * Normally, you should not catch the exception.
 */
export class RxNostrAlreadyDisposedError extends RxNostrError {
  constructor() {
    super("RxNostrAlreadyDisposedError: Attempted to access a disposed resource.");
    this.name = "RxNostrAlreadyDisposedError";
  }
}
