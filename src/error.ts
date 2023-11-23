export abstract class RxNostrError extends Error {}

export class RxNostrWebSocketError extends RxNostrError {
  constructor(public code?: number) {
    super(`WebSocketError: WebSocket was closed with code ${code} by relay.`);
  }
}

export class RxNostrLogicError extends RxNostrError {
  constructor() {
    super(
      "RxNostrLogicError: This is rx-nostr's internal bug. Please report to the author of the library."
    );
  }
}

export class RxNostrAlreadyDisposedError extends RxNostrError {
  constructor() {
    super(
      "RxNostrAlreadyDisposedError: Attempted to access a disposed resource."
    );
  }
}
