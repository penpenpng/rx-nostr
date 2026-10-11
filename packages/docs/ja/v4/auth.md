# NIP-42 AUTH

AUTH は opt-in です。通常の signer を指定しただけでは有効になりません。wallet の署名 prompt が意図せず表示されることを避けるため、`authenticator` を明示します。

## `SimpleAuthenticator`

通常の signer で kind 22242 の EVENT を署名する場合は `SimpleAuthenticator` を使います。

<!-- typecheck-example: auth-basic -->
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

## 接続単位の認証と再送

AUTH 状態は relay の接続単位で共有されます。`authenticator` は `RxNostr` の設定に指定します。REQ・publish ごとの上書きはできません。異なる認証主体や認証方針で通信する場合は、別の `RxNostr` インスタンスを使用してください。インスタンスの `authenticator: false` は static default の AUTH 設定を無効化します。

challenge を受信すると、authenticator が設定されている接続では直ちに認証します。接続を温めている場合も署名 callback が呼ばれます。

1. challenge を authenticator へ渡す
2. kind 22242 の AUTH EVENT を送る
3. AUTH EVENT に対する `OK true` を待つ

認証中は、通常の REQ・EVENT の新規送信と再送を待機させます。AUTH 自体と、リソースを解放する CLOSE は待機しません。認証が成功または失敗したら通常送信を進めます。失敗時は未認証のまま送信します。

送信済みの REQ が `auth-required:` の CLOSED、または EVENT が `auth-required:` の `OK false` を受けた場合は、現在の challenge の認証成功後に一度だけ再送します。成功済みなら直ちに再送します。認証失敗済み、challenge なし、AUTH 無効の場合はその relay effort を終了します。再送が再び `auth-required` で拒否されても再認証・再送を繰り返しません。

同じ接続・challenge に対する複数 operation は、ひとつの AUTH 送信と成功・失敗結果を共有します。同じ challenge で失敗した AUTH は再試行しません。新しい challenge が届くと、一度の新しい認証を開始できます。

元の EVENT に対する `auth-required` の `OK false` は `Publication.subscribe()` で観測できますが、認証後の再送が残っている間は最終的な publication failure ではありません。

operation のキャンセルはその operation の待機と再送を取り消します。接続が維持されている間は、共有 AUTH は継続します。

## Timeout と stale challenge

AUTH の OK 待機時間は Authenticator の `authTimeout` で指定します。省略時は 30 秒です。署名 callback の完了待ちはこの timeout に含まれません。Authenticator factory を使えば、relay ごとに異なる値を設定できます。

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
