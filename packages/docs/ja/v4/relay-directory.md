# Relay Directory

`RelayDirectory` は、正規化された relay URL ごとに NIP-11 metadata と接続 health を保持します。socket、query、retry は所有しません。

既定では `GlobalRelayDirectory` が使われます。アプリケーションまたはテストで分離したい場合は専用の instance を注入します。

```ts
import { RelayDirectory, RxNostr } from "rx-nostr";

const directory = new RelayDirectory();
const rxNostr = new RxNostr({
  verifier,
  relayDirectory: directory,
});
```

## Entry を読む

```ts
const entry = directory.get("wss://relay.example.com");
console.log(entry?.nip11);
console.log(entry?.maxSubscriptions);
console.log(entry?.consecutiveFailures);
console.log(entry?.liveConnections);
```

主な property は次のとおりです。

| property | 内容 |
| --- | --- |
| `url` | 正規化済み URL |
| `nip11` | NIP-11 relay information |
| `nip11FetchedAt` | 最後に取得に成功した時刻 |
| `nip11FailedAt` | 最後に取得に失敗した時刻 |
| `maxSubscriptions` | 有効な `limitation.max_subscriptions` |
| `lastConnectedAt` | 最後に接続した時刻 |
| `lastFailureAt` | 最後に接続失敗を記録した時刻 |
| `consecutiveFailures` | 最新の成功以降の連続失敗数 |
| `liveConnections` | Directory を共有する instance の接続数 |

entry は Directory の内部状態から切り離された変更可能な snapshot です。entry を変更しても Directory には反映されません。Directory の変更を購読するには `observe()` を使います。各 observer には独立した snapshot が渡されます。

```ts
const subscription = directory
  .observe("wss://relay.example.com")
  .subscribe((entry) => console.log(entry));
```

## NIP-11

RxNostr は relay への接続需要が初めて発生したとき、NIP-11 cache を確認し、cache がなければ取得を開始します。REQ は取得が完了するまで NIP-11 queue で待機します。

取得は `nip11Timeout`（既定値30,000 ms）まで待機します。取得に失敗した場合、その事実を Directory に記録したうえで、最新の cache または空の metadata を利用します。取得失敗自体は operation を失敗させません。

手動取得、refresh、手動設定も可能です。

```ts
await directory.fetchNip11("wss://relay.example.com");

await directory.fetchNip11("wss://relay.example.com", {
  refresh: true,
});

directory.setNip11("wss://relay.example.com", {
  name: "My Relay",
  limitation: {
    max_subscriptions: 20,
  },
});
```

同じ URL に対する同時 fetch はひとつにまとめられ、完了した結果は cache されます。

自動取得だけを止めるには `skipFetchNip11: true` を指定します。この option は Directory に既に存在する metadata の利用までは無効にしません。

```ts
const rxNostr = new RxNostr({
  verifier,
  relayDirectory: directory,
  skipFetchNip11: true,
});
```

`maxSubscriptions` が存在する場合、同じ relay に送る物理 REQ の同時数はこの値に制限され、超過分は FIFO queue で待機します。

## Snapshot の保存

Directory の永続化先はアプリケーションが選びます。

```ts
localStorage.setItem("relay-directory", directory.exportSnapshot());

const saved = localStorage.getItem("relay-directory");
if (saved !== null) {
  directory.importSnapshot(saved);
}
```

snapshot は version 1 の JSON です。NIP-11 と health の時刻、失敗数を保存しますが、live connection は保存しません。

`importSnapshot()` は入力全体を検証してから既存値と merge します。不正な JSON、未知の version、不正な schema は `RelayDirectorySnapshotError` になり、途中まで適用されることはありません。

## Entry を忘れる

```ts
directory.forget("wss://relay.example.com");
```

進行中の NIP-11 fetch や live connection がある entry は削除されず、`false` を返します。

## NIP-11 だけを取得する

Directory を使わず単発で取得する場合は `fetchRelayInfo()` を使えます。

```ts
import { fetchRelayInfo } from "rx-nostr";

const info = await fetchRelayInfo("wss://relay.example.com");
```

WebSocket URL は対応する HTTP/HTTPS URL へ変換され、`Accept: application/nostr+json` で取得されます。
