# Delegation

rx-nostr は [NIP-26](https://github.com/nostr-protocol/nips/blob/master/26.md) に基づくイベントの委任に対応しています。

## Publish Deleteged Events

`delegateSigner()` を利用すると委任されたイベントを発行できます。

```ts
import { delegateSigner, seckeySigner } from "rx-nostr";

const signer = delegateSigner({
  delegateeSigner: seckeySigner(seckeyChild),
  delegatorSeckey: seckeyRoot,
  allowedKinds: [0, 1],
  allowedSince: 777777,
  allowedUntil: 888888,
});
```

`allowed...` フィールドは単に委任文字列を作るためだけに用いられます。すなわち、`delegateSigner()` による署名器は委任条件外のイベントも生成することができます。

もし委任条件の検証を行いたい場合は `validateDelegation()` が利用できます。

## Subscribe Delegated Events

`acceptDelegatedEvent` オプションを有効化すると、委任されたイベントを購読できるようになります (リレーが NIP-26 に基づくクエリに対応している必要があります)。

`acceptDelegatedEvent` の設定に関わらず、`EventPacket` はそのイベントの「ルート公開鍵」が何であるかを示す `rootPubkey` フィールドを公開しています。このフィールドは、イベントが委任されていれば委任元の公開鍵と、委任されていなければイベントの発行元の公開鍵と等しいです。

[Auto Validation](./auto-filtering#auto-validation) も参照してください。
