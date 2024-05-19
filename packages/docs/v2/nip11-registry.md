# NIP-11 Registry

[REQ Queue](./subscribe-event.html#req-queue) で説明した通り、rx-nostr はリレーの制約を尊重して動作するために NIP-11 に関連する情報を自動で取得します。この動作は `createRxNostr()` の `skipFetchNip11` オプションで無効にできます。

::: tip Note
今のところ、rx-nostr が動作の最適化のために利用する情報は `limitation.max_subscriptions` のみです。
:::

rx-nostr が扱う NIP-11 情報は `Nip11Registry` に集約されます。`Nip11Registry` は公開されており、開発者はこのクラスが提供する静的メソッドを通じて NIP-11 情報にアクセスできます。

## Get NIP-11 info

rx-nostr によってすでに取得された NIP-11 情報のキャッシュは `Nip11Registry.get()` で取得できます。

## Fetch NIP-11 info manually

`Nip11Registry.fetch()` によって手動で NIP-11 を取得することもできます。このようにして一度取得された情報は、たとえ `skipFetchNip11` が設定されていたとしても、rx-nostr が動作の最適化のために利用できます。

## Set Default NIP-11 info

特別な事情 (例えばテストなど) によって `skipFetchNip11` を設定した場合や、そもそもリレーが NIP-11 をサポートしていなかった場合のために、`Nip11Registry.setDefault()` を使ってデフォルトの NIP-11 情報を設定することができます。

例えば、以下のように設定すると、rx-nostr は NIP-11 情報を取得できなかった際には `limitation.max_subscriptions` が `10` であるものとして振る舞います。

```ts
import { Nip11Registry } from "rx-nostr";

Nip11Registry.setDefault({
  limitation: {
    max_subscriptions: 10,
  },
});
```

## Set NIP-11 info manually

NIP-11 をサポートしていない特定のリレーのために NIP-11 情報を手動で設定することもできます。

```ts
import { Nip11Registry } from "rx-nostr";

Nip11Registry.set("wss://nostr.example.com", {
  limitation: {
    max_subscriptions: 10,
  },
});
```
