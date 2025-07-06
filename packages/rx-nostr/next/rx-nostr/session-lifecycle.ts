import { Deferrer, RelayMap } from "../libs/index.ts";
import type { RelayCommunication } from "./relay-communication.ts";

export type ConnectionResult = "skipped" | "connected";

export class SessionLifecycle {
  private deferrer = new Deferrer();
  private map = new RelayMap<{
    connected: Promise<void>;
    relay: RelayCommunication;
  }>();
  private defer: boolean;
  private linger: number;
  private weak: boolean;

  constructor(params: { defer: boolean; linger: number; weak: boolean }) {
    this.defer = params.defer;
    this.linger = params.linger;
    this.weak = params.weak;
  }

  /**
   * `preconnect()` is invoked only once when the possibility arises that a WebSocket connection is needed.
   * Specifically, it is called synchronously as a result of calling `req().subscribe()` or `event()`.
   *
   * - For non-`defer` connections, the connection attempt is initiated at this phase.
   * - For `weak` connections, no connection attempt is made.
   */
  async preconnect(relay: RelayCommunication): Promise<ConnectionResult> {
    if (this.weak || this.defer) {
      return "skipped";
    }

    const connected = relay.connect();
    this.map.set(relay.url, { connected, relay });

    return connected.then(() => "connected");
  }

  /**
   * `connect()` is invoked when the payload to be sent has been fully determined
   * and immediate communication over the WebSocket is required.
   *
   * - For `defer` connections, the connection attempt is initiated at this phase.
   * - For `weak` connections, no connection attempt is made.
   * - If the connection is already attempted, it does nothing. // 嘘かも
   */
  async connect(relay: RelayCommunication): Promise<ConnectionResult> {
    if (this.weak) {
      return "skipped";
    }

    const attempt = this.map.get(relay.url);

    if (attempt) {
      // TODO: この間にリリースされちゃったときの処理 (面倒)
      // そもそも lifecycle result を使わないなら面倒しなくていいので先に上のレイヤーを書いて検討する
      return attempt.connected.then(() => "connected");
    } else {
      const connected = relay.connect();
      this.map.set(relay.url, { connected, relay });

      return connected.then(() => "connected");
    }
  }

  release(relay: RelayCommunication): void {
    if (this.weak) {
      return;
    }

    if (!Number.isFinite(this.linger)) {
      return;
    }

    // TODO: いったん release されたあとにもう一度 connect される可能性がある。
    // deferrer が走っていると新しい connect が間違って release されてしまう
    this.deferrer.invoke(
      () => {
        this.map.get(relay.url)?.relay.release();
        this.map.delete(relay.url);
      },
      Math.max(0, this.linger),
    );
  }

  // dispose されたときだけに呼び出す
  cleanup(): void {
    if (this.weak) {
      return;
    }

    this.deferrer.cancelAll();

    for (const { relay } of this.map.values()) {
      relay.release();
    }
    this.map.clear();
  }
}
