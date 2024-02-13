# NIP-11 Registry

[REQ Queue](./subscribe-event.html#req-queue) で説明した通り、rx-nostr はリレーの制約を尊重して動作するために NIP-11 に関連する情報を自動で取得します。この動作は `createRxNostr()` の `skipFetchNip11` オプションで無効にできます。

::: tips Note
今のところ、rx-nostr が動作の最適化のために利用する情報は `limitation.max_subscriptions` のみです。
:::

rx-nostr が扱う NIP-11 情報は `Nip11Registry` に集約されます。`Nip11Registry` は公開されており、開発者はこのクラスが提供する静的メソッドを通じて NIP-11 情報にアクセスできます。

## Set Default NIP-11 info

特別な事情 (例えばテストなど) によってこの動作を無効にした場合や、そもそもリレーが NIP-11 をサポートしていなかった場合のために、`Nip11Registry` を使って「デフォルトの NIP-11 情報」を設定することができます。例えば、以下のようにすることで、rx-nostr は NIP-11 情報を取得できなかった際には `limitation.max_subscriptions` が `10` であるものとして振る舞います。

```ts
import { Nip11Registry } from "rx-nostr";

Nip11Registry.setDefault({
  limitation: {
    max_subscriptions: 10,
  },
});
```
