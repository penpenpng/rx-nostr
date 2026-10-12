# Signer

Signer は発行する EVENT を完成させ、Verifier は受信した EVENT の署名を検証します。v4 ではどちらも class-based interface です。

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

## `Nip07Signer`

rx-nostr 本体が提供する既定 signer です。ブラウザの `window.nostr` を使います。

```ts
import { Nip07Signer } from "rx-nostr";

const signer = new Nip07Signer();
```

NIP-07 provider が存在しない環境で署名を要求すると、publication は callback error になります。`Nip07Signer.getPublicKey()` はブラウザ外や provider の同期例外も Promise の reject として通知します。provider が存在しない場合の原因は `RxNostrEnvironmentError` です。

## `SeckeySigner`

`@rx-nostr/crypto` が提供し、nsec または hex の秘密鍵で署名します。

通常版と WASM 版の `SeckeySigner` は、`tags` と `created_at` を省略した場合にそれぞれ空配列と現在時刻を補います。`created_at` は 0 以上の安全な整数である必要があり、負数・小数・非有限値・安全な整数範囲外の値は、署名済み入力でも `RangeError` で拒否します。明示した時刻を別の値に丸めることはありません。完全に署名済みの EVENT を渡した場合は ID と署名を保持します。Nip07Signer・通常版 / WASM 版 SeckeySigner の constructor に `tags` option はありません。tags は署名前に EVENT parameters へ指定してください。署名済み EVENT の内容を変更して再署名する場合は、古い `id`・`sig`・`pubkey` を引き継がず、新しい EVENT parameters を作ってください。

```ts
import { SeckeySigner } from "@rx-nostr/crypto";

const signer = new SeckeySigner("nsec1...");
```

## `NoopSigner`

入力を署名済み EVENT とみなしてそのまま返します。検証や補完は行いません。

```ts
import { NoopSigner } from "rx-nostr";

rxNostr.publish(relays, signedEvent, {
  signer: new NoopSigner(),
});
```
