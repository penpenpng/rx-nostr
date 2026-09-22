# Sign / Verify

Signer は発行する EVENT を完成させ、Verifier は受信した EVENT の署名を検証します。v4 ではどちらも class-based interface です。

## Signer

```ts
interface EventSigner {
  signEvent<K extends number>(
    params: Nostr.EventParameters<K>,
  ): Promise<Nostr.Event<K>>;
  getPublicKey(): Promise<string>;
}
```

root signer は instance config で指定し、publication ごとに上書きできます。

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

```ts
import { VerificationHost } from "rx-nostr";
import { SimpleVerifier } from "@rx-nostr/crypto";

const host = new VerificationHost(new SimpleVerifier());
host.start();
```

Application 側:

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

Worker の起動中または error 状態では `fallback` が使われます。dispose 後の client は再利用できません。
