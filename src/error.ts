export abstract class RxNostrError extends Error {}

/**
 * This is thrown when WebSocket connection is closed unexpectedly.
 * You may see them in a stream made by `rxNostr.createAllErrorObservable()`.
 */
export class RxNostrWebSocketError extends RxNostrError {
  constructor(public code?: number) {
    super(`WebSocketError: WebSocket was closed with code ${code} by relay.`);
  }
}

/**
 * This is thrown only by a bug inside rx-nostr.
 * Normally, you should not catch the exception.
 */
export class RxNostrLogicError extends RxNostrError {
  constructor() {
    super(
      "RxNostrLogicError: This is rx-nostr's internal bug. Please report to the author of the library."
    );
  }
}

/**
 * This is thrown when you attempt to access a disposed rx-nostr's resource.
 * Normally, you should not catch the exception.
 */
export class RxNostrAlreadyDisposedError extends RxNostrError {
  constructor() {
    super(
      "RxNostrAlreadyDisposedError: Attempted to access a disposed resource."
    );
  }
}
