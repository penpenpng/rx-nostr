# Legacy Mode

`rx-nostr/legacy` の `createLegacyRxNostr()` は v4 の `RxNostr` を内部に持ち、v3 形式の default relay、`use()`、`send()`、`cast()` などを提供する移行用 facade です。利用できる範囲は `ILegacyRxNostr` と関連する公開型に従います。

## クライアントを作る

<!-- typecheck-example: legacy-basic -->
```ts
import { createLegacyRxNostr } from "rx-nostr/legacy";
import { RxReq } from "rx-nostr";
import { SimpleVerifier } from "@rx-nostr/crypto";

const rxNostr = createLegacyRxNostr({ verifier: new SimpleVerifier() });
rxNostr.setDefaultRelays(["wss://relay.example.com"]);

const request = new RxReq();
const subscription = rxNostr.use(request).subscribe(console.log);
request.emit([{ kinds: [1] }]);

subscription.unsubscribe();
request.dispose();
rxNostr.dispose();
```

`use()` は v4 の `forward()` を使います。request は `RxReq` を使用し、過去イベントを EOSE まで取得する場合は v4 の `backward()` へ移行してください。v3 の `createRxNostr()` や request factory の alias は提供しません。

## Relay と送信の完了条件

移行用の `rx-nostr/legacy` facade では、default / additional relay を URL、`Set`、generator、URL を key とする permission map で指定できます。`read: false` の relay は `use()` の宛先から、`write: false` の relay は `send()` / `cast()` の宛先から除外されます。`use()` は cold Observable で、同じ戻り値を複数回 subscribe しても各 subscription の宛先追従と解除は独立します。`send()` は呼び出し時に始まる hot operation です。`cast()` は少なくともひとつの relay へ EVENT を送信してから resolve し、OK は待ちません。

legacy の `send()` / `cast()` は書き込み先が空なら `no-relays` で失敗します。`completeOn: "any-ok"` はいずれかの `OK true` で完了し、全宛先で受理されなければ `all-failed` で失敗します。`completeOn: "all-ok"` は v3 と同じく全宛先の最終応答を待つ方式で、`OK false` 自体は stream の error に変換しません。各 `LegacyOkPacket.ok` を確認してください。`errorOnTimeout: true` のときは timeout を `TimeoutError` として通知します。

`setDefaultRelays()` は既定集合を置き換え、`addDefaultRelays()` と `removeDefaultRelays()` はその集合を変更します。`setAdditionalRelays()` は追加集合を置き換えます。`RxRelays` をこれらの setter に渡した場合も、設定時の内容を読み取ります。

`use()` の `on.relays` は明示的な宛先を追加し、`on.defaultReadRelays: false` は default / additional の読み取り集合を除外します。`send()` / `cast()` では `on.defaultWriteRelays: false` が書き込み集合を除外します。

`send()` の `completeOn` は既定で `"all-ok"` です。`"sent"` は少なくともひとつの relay への EVENT 送信成功で完了します。返される `LegacyOkPacket` は `OkPacket` に `done` を追加した型です。

## 接続戦略

`rx-nostr/legacy` facade の `lazy` は需要終了後に切断し、`lazy-keep` は最初に `use()` を subscribe するか `send()` / `cast()` で選んだ relay を dispose まで維持します。`aggressive` は default relay の設定時に接続を温めます。`disconnectTimeout` は操作終了後の linger を指定します。

## 設定の移行

| Legacy 設定 | v4 内部への適用 |
| --- | --- |
| `websocketCtor` | `WebSocket` が明示されていない場合に使う |
| `eoseTimeout` / `okTimeout` | REQ / publish の既定 `timeout` |
| `disconnectTimeout` | REQ / publish の既定 `linger` |
| 関数形式の `verifier` | `EventVerifier.verifyEvent()` に適合させる |
| `skipVerify: true` | `NoopVerifier` を使う |
| `retry` | `reconnector` が明示されていない場合に legacy retry 設定から構成する |
| `authTimeout` | 明示した Authenticator の AUTH 待機時間を上書きする |

AUTH を使う場合は `SimpleAuthenticator` などを明示します。`authenticator: "auto"` はありません。

`createConnectionStateObservable()` は legacy の状態名を通知します。`getRelayStatus()` / `getAllRelayStatus()` で保持中の状態を参照できます。不要になった facade は `dispose()` または `Symbol.dispose` で終了します。

v4 の API へ置き換える手順は [Migration Guide](./migration-guide) を参照してください。
