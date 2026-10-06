# Sign / Verify

Signer は発行する EVENT を完成させ、Verifier は受信した EVENT の署名を検証します。v4 ではどちらも class-based interface です。

## Signer

<!-- typecheck-example: signer-interface -->
```ts
interface EventSigner {
  signEvent<K extends number>(
    params: Nostr.EventParameters<K>,
  ): Promise<Nostr.Event<K>>;
  getPublicKey(): Promise<string>;
}
```

root signer は instance config で指定し、publication ごとに上書きできます。

<!-- typecheck-example: signer-config -->
```ts
const rxNostr = new RxNostr({
  verifier,
  signer,
});

rxNostr.publish(relays, params, {
  signer: anotherSigner,
});
```

### `Nip07Signer`

rx-nostr 本体が提供する既定 signer です。ブラウザの `window.nostr` を使います。

```ts
import { Nip07Signer } from "rx-nostr";

const signer = new Nip07Signer({
  tags: [["client", "my-app"]],
});
```

NIP-07 provider が存在しない環境で署名を要求すると、publication は callback error になります。

### `SeckeySigner`

`@rx-nostr/crypto` が提供し、nsec または hex の秘密鍵で署名します。

通常版と WASM 版の `SeckeySigner` は、`tags` と `created_at` を省略した場合にそれぞれ空配列と現在時刻を補います。完全に署名済みの EVENT を追加 tags なしで渡した場合は ID と署名を保持します。signer の `tags` option で tags を追加する場合は元の ID・署名を使い回さず、追加後の内容を signer の鍵で再署名します。

```ts
import { SeckeySigner } from "@rx-nostr/crypto";

const signer = new SeckeySigner("nsec1...");
```

### `NoopSigner`

入力を署名済み EVENT とみなしてそのまま返します。検証や補完は行いません。

```ts
import { NoopSigner } from "rx-nostr";

rxNostr.publish(relays, signedEvent, {
  signer: new NoopSigner(),
});
```

## Verifier

### 構造検査と署名検証

`rx-nostr/utils` の `ensureEventFields(value)` は EVENT の基本構造を調べる type guard です。必須の文字列 field、有限で安全な整数の `created_at`、0〜65,535 の整数 `kind`、1 要素以上の文字列からなる各 tag を確認します。短い `id` や `sig` も文字列として受け入れるため、これだけで [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md#events-and-signatures) の形式や署名の正しさは保証しません。

relay tuple の decoder はこの構造検査を行い、不正な EVENT tuple を破棄します。publish でも signer の戻り値に同じ構造検査を行い、不正なら `RxNostrCallbackError` にします。どちらも本体で暗号ライブラリを読み込みません。通常版と WASM 版の `SimpleVerifier` は、lowercase hex の `id` / `pubkey` / `sig` の長さ、内容から再計算した ID、Schnorr 署名を検証し、不正な EVENT には `false` を返します。実際に受信した EVENT を通すかどうかは設定した `EventVerifier` が決めます。

<!-- typecheck-example: verifier-interface -->
```ts
interface EventVerifier {
  verifyEvent(event: Nostr.Event): Promise<boolean>;
}
```

実際の `verifier` は instance config、`RxNostr.defaultConfig.verifier`、または query ごとに指定できます。

### 省略時の verifier

省略時には fail-closed の内部実装が使われます。EVENT の検証を要求されると例外を投げるため、publish-only client は verifier なしで構築できますが、未検証の EVENT を暗黙に受け入れることはありません。

### `SimpleVerifier`

`@rx-nostr/crypto` が提供する標準的な実装です。

```ts
import { SimpleVerifier } from "@rx-nostr/crypto";

const verifier = new SimpleVerifier();
```

### `NoopVerifier`

すべての EVENT を正当とみなします。検証を省略することが明確になるよう、意図的な用途でのみ指定してください。

```ts
import { NoopVerifier } from "rx-nostr";

const rxNostr = new RxNostr({
  verifier: new NoopVerifier(),
});
```

verifier が `false` を返した EVENT は通知されません。verifier が例外を投げた場合は `RxNostrCallbackError` として query が error になります。

## Worker で検証する

大量の EVENT を扱う UI では、`VerificationHost` と `VerificationClient` を使って検証を Worker へ移せます。

Worker 側:

<!-- typecheck-example: worker-host -->
```ts
import { VerificationHost } from "rx-nostr";
import { SimpleVerifier } from "@rx-nostr/crypto";

const host = new VerificationHost(new SimpleVerifier());
host.start();
```

Application 側:

<!-- typecheck-example: worker-client -->
```ts
import { VerificationClient, RxNostr } from "rx-nostr";
import { SimpleVerifier } from "@rx-nostr/crypto";

const client = new VerificationClient({
  worker: new Worker(new URL("./verification-worker.ts", import.meta.url), {
    type: "module",
  }),
  fallback: new SimpleVerifier(),
  timeout: 10_000,
});

client.start();

const rxNostr = new RxNostr({ verifier: client });

// 終了時
rxNostr.dispose();
client.dispose();
```

Worker の起動中または error 状態では新しい検証に `fallback` が使われます。Worker 実行中の検証は Worker の error や dispose によって reject されるため、呼び出し側で扱ってください。dispose 後の client は再利用できません。

起動時の `ping` 送信に失敗した場合も `error` 状態になります。error 後に遅れて `pong` が届いても active には戻りません。Worker が停止した場合に備え、起動中や error 時も検証を続けたいアプリケーションでは `fallback` を設定してください。

Worker 内の verifier が `false` を返した場合は署名不一致として `verifyEvent()` が `false` で解決します。verifier が例外を投げた場合は Worker がエラーの文字列表現だけを返し、Client は新しい `Error` で reject します。元の Error の identity と stack は Worker 境界を越えません。rx-nostr の query で使う場合は `RxNostrCallbackError`（`callback: "verifier"`）として通知されます。

`timeout` は Worker と fallback のどちらの経路でも各 `verifyEvent()` の開始から測る待ち時間で、既定値は 10,000 ms です。`0` は次の timer 実行時に timeout、`Infinity` は timeout 無効です。負数、`NaN`、2,147,483,647 ms を超える値は constructor で `RangeError` になります。応答または dispose で request の timer は解除されます。

Client の dispose は fallback を含む未完了の検証 Promise を reject します。timeout または dispose 後に fallback が返す結果は無視します。注入した fallback 自体の処理停止や dispose は呼び出し側の責務であり、Client は行いません。Worker の error は実行中の fallback の検証には影響しません。
