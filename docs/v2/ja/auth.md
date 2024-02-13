# AUTH

`createRxNostr()` の `authenticator` オプションを設定すると、rx-nostr は[NIP-42](https://github.com/nostr-protocol/nips/blob/master/42.md) に基づく AUTH メッセージを自動でハンドリングするようになります。

もっともシンプルな設定は `authenticator: "auto"` です。これは `RxNostr` に与えられた `signer` を使用して AUTH message に応答します。ほとんどのユースケースではこの設定で十分のはずです。

```ts:line-numbers
import { createRxNostr } from "rx-nostr";

const rxNostr = createRxNostr({ authenticator: "auto" });
```

より高度なユースケースに対応するため、`authenticator` は `signer` をオプションに取ることができます。これにより、通常のイベント発行時とは異なる署名器を用いて AUTH message を作成できます:

```ts:line-numbers
import { createRxNostr, nsecSigner } from "rx-nostr";

const rxNostr = createRxNostr({
  signer: nsecSigner("nsec1aaa..."),
  authenticator: {
    signer: nsecSigner("nsec1bbb..."),
  },
});
```

また、リレーごとに異なる署名器を使いたい場合のために、関数形式の指定も可能です。例えば以下の例では、`wss://nostr.example.com` でのみ AUTH message に応答し、他のリレーでは AUTH を無視します:

```ts:line-numbers
import { createRxNostr, nsecSigner } from "rx-nostr";

const rxNostr = createRxNostr({
  authenticator: (relayUrl) => {
    if (relayUrl === "wss://nostr.example.com") {
      return "auto";
    } else {
      return undefined;
    }
  },
});
```
