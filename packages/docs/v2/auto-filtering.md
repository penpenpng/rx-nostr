# Auto Filtering

rx-nostr は REQ の結果として返されるイベントのうち不適格と判断されるものを自動的にフィルターします。この挙動は `createRxNostr()` のオプションから変更できます。

## Auto Verification

自動で署名を検証し、検証に失敗したイベントを結果から除きます。同時に、[NIP-26](https://github.com/nostr-protocol/nips/blob/master/26.md) に基づいて委任されたイベントが存在する場合は、委任トークンの正当性も検証します。

この挙動は `skipVerify` オプションで無効にできます。

## Auto Validation

REQ の結果として返されたイベントが本当に REQ のフィルターに合致しているかを自動で検証し、検証に失敗したイベントを結果から除きます。

この挙動は `skipValidateFilterMatching` オプションで無効にできます。

::: tip Note
`search` フィールドに対する標準化された解釈は存在しないため、同フィールドの検証は行われません。
:::

もし Auto Validation が有効かつ `acceptDelegatedEvent` オプションも有効ならば、`authors` フィールドによるフィルタリングが委任されたイベントも受け入れるようになります。すなわち、`authors` フィールドに指定された公開鍵が `event.pubkey` と一致しなくても、イベントの委任元が `authors` に含まれているならばそれは正当なイベントとみなされます。

`acceptDelegatedEvent` はデフォルトでは無効になっています。

## Auto Expiration Check

[NIP-40](https://github.com/nostr-protocol/nips/blob/master/40.md) に基づいて、REQ の結果として返されたイベントが期限切れとなっていないかを自動で確認し、期限が切れているイベントを結果から除きます。

この挙動は `skipExpirationCheck` オプションで無効にできます。
