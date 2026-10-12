# Drop Detection

## Drop detector

`dropDetectors` には、接続が ready になったあと独自の条件で異常を検出する detector を指定できます。公開される context は rx-nostr 独自型であり、送受信値には Nostr message tuple を使います。

```ts
import type { ConnectionDropDetector } from "rx-nostr";

const heartbeat: ConnectionDropDetector = {
  name: "heartbeat",
  setup(context) {
    context.run(async (signal) => {
      while (!signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, 30_000));
        if (signal.aborted) return;

        try {
          await context.request({
            query: ["COUNT", "heartbeat", { limit: 1 }],
            selector: (message) => message[0] === "COUNT" && message[1] === "heartbeat",
            timeout: 5_000,
            signal,
          });
        } catch {
          context.drop();
        }
      }
    });
  },
};

const rxNostr = new RxNostr({ verifier, dropDetectors: [heartbeat] });
```

`setup()` は物理 connection ごとに呼ばれます。返した disposer と `context.defer()` へ登録した disposer は、その connection の終了時に実行されます。`signal` も同時に abort され、`drop()` が最初に接続異常を報告した場合は configured reconnector による復旧へ進みます。

detector は `context.drop({ reason, details, affectsRelayHealth })` で原因を報告できます。既知のローカル環境要因なら `affectsRelayHealth: false` を指定し、その drop をリレーの失敗回数から除外できます。detector 名と理由は reconnector の `context.reason.detector` に渡します。`context.sessionSignal` は再接続待機を含む論理 session の寿命を表します。

ブラウザーや heartbeat の監視方法は選択した detector / reconnector に所属します。rx-nostr が browser 専用 detector を暗黙に追加することはありません。
