export abstract class RxNostrError extends Error {}

/**
 * This is thrown when WebSocket connection is closed unexpectedly.
 * You may see them in a stream made by `rxNostr.createAllErrorObservable()`.
 */
export class RxNostrWebSocketError extends RxNostrError {
  constructor(public code?: number) {
    super(
      `RxNostrWebSocketError: WebSocket was closed with code ${code} by relay.`
    );
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
 * This is thrown only by a bug inside rx-nostr.
 *
 * Normally, you should not catch the exception.
 */
export class RxNostrLogicError extends RxNostrError {
  constructor() {
    super(
      "RxNostrLogicError: This is rx-nostr's internal bug. Please report to the author of the library."
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
    super(
      "RxNostrAlreadyDisposedError: Attempted to access a disposed resource."
    );
    this.name = "RxNostrAlreadyDisposedError";
  }
}
