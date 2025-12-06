export class ConnectionState {
  constructor(
    public readonly state: ConnectionStateSymbol,
    public readonly reason?: unknown,
  ) {}

  get isConnecting(): boolean {
    return this.state === "connecting" || this.state === "retrying";
  }

  get isConnected(): boolean {
    return this.state === "connected";
  }

  get isDisconnected(): boolean {
    return !this.isConnecting && !this.isConnected;
  }

  get willRetry(): boolean {
    return this.state === "disconnected-unexpectedly-will-retry";
  }

  get wontRetry(): boolean {
    return (
      this.state === "disconnected-expectedly" ||
      this.state === "disconnected-unexpectedly-wont-retry" ||
      this.state === "disposed"
    );
  }

  equals(other: ConnectionState): boolean {
    return (
      this.state === other.state &&
      (this.reason === other.reason ||
        this.reason?.toString() === other.reason?.toString())
    );
  }
}

export type ConnectionStateSymbol =
  | "not-started"
  | "connecting"
  | "retrying"
  | "connected"
  | "disconnected-expectedly"
  | "disconnected-unexpectedly-wont-retry"
  | "disconnected-unexpectedly-will-retry"
  | "disposed";
