# NIP-42 AUTH

AUTH は opt-in です。通常の signer を指定しただけでは有効になりません。wallet の署名 prompt が意図せず表示されることを避けるため、`authenticator` を明示します。

## `SimpleAuthenticator`

通常の signer で kind 22242 の EVENT を署名する場合は `SimpleAuthenticator` を使います。

```ts
import { SimpleAuthenticator, RxNostr } from "rx-nostr";
import { SeckeySigner, SimpleVerifier } from "@rx-nostr/crypto";

const signer = new SeckeySigner("nsec1...");

const rxNostr = new RxNostr({
  verifier: new SimpleVerifier(),
  signer,
  authenticator: new SimpleAuthenticator(signer),
});
```

`SimpleAuthenticator` は、正規化済み relay URL と challenge をそれぞれ `relay`、`challenge` tag に入れた EVENT を signer に渡します。

## Relay ごとに切り替える

factory を渡すと、relay ごとに authenticator を選べます。`undefined` を返した relay では AUTH に応答しません。

```ts
const authenticator = new SimpleAuthenticator(signer);

const rxNostr = new RxNostr({
  verifier,
  authenticator(relay) {
    return relay === "wss://private.example.com"
      ? authenticator
      : undefined;
  },
});
```

factory には正規化済みの URL が渡されます。

## Operation ごとに上書きする

REQ と publish の config で root の設定を上書きできます。`false` を指定すると、その operation では AUTH を明示的に無効化します。

```ts
rxNostr.req(relays, [{}], {
  authenticator: false,
});

rxNostr.publish(relays, params, {
  authenticator: anotherAuthenticator,
});
```

## 再送

リレーが `auth-required:` の CLOSED または `OK false` を返すと、rx-nostr は次の順序で処理します。

1. 最新の challenge を authenticator へ渡す
2. kind 22242 の AUTH EVENT を送る
3. AUTH EVENT に対する `OK true` を待つ
4. 拒否された元の REQ または EVENT を一度だけ再送する

同じ relay、接続世代、challenge に対する複数 operation は、ひとつの AUTH 送信と結果を共有します。AUTH の再送が再び auth-required で拒否されても loop はせず、その relay effort を終了します。

AUTH に関連する `OK false` も `Publication.subscribe()` では観測できますが、認証後の再送が残っている間は最終的な publication failure ではありません。

## Timeout と stale challenge

AUTH の OK 待機時間は Authenticator の `authTimeout` で指定します。省略時は 30 秒です。Authenticator factory を使えば、relay ごとに異なる値を設定できます。

```ts
const authenticator = new SimpleAuthenticator(signer, {
  authTimeout: 10_000,
});

const rxNostr = new RxNostr({
  verifier,
  authenticator,
});
```

再接続または新しい challenge によって古い challenge は無効になります。古い非同期署名があとから完了しても送信されません。AUTH の失敗は原則としてその relay の operation だけを終了し、別 relay の処理には影響しません。

Custom authenticator は次の interface を実装します。

```ts
interface Authenticator {
  readonly authTimeout?: number;
  challenge(
    relay: RelayUrl,
    challenge: string,
  ): Promise<Nostr.Event<22242>>;
}
```
