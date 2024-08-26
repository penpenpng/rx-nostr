# Auto Filtering

rx-nostr automatically filters invalid events returned as a result of REQ. You can change these behavior by options of `createRxNostr()`.

## Auto Verification

rx-nostr automatically verifies signatures and excludes from the results events that fail verification. At the same time, it also verifies the validity of the delegation token if an event delegated under [NIP-26](https://github.com/nostr-protocol/nips/blob/master/26.md) exists.

You can disable this behavior by `skipVerify` option.

## Auto Validation

rx-nostr automatically verifies that the events returned as a result of REQ really match the REQ filters, and excludes events that fail verification from the results.

You can disable this behavior by `skipValidateFilterMatching` option.

::: tip Note
`search` フィールドに対する標準化された解釈は存在しないため、同フィールドの検証は行われません。
:::

もし Auto Validation が有効かつ `acceptDelegatedEvent` オプションも有効ならば、`authors` フィールドによるフィルタリングが委任されたイベントも受け入れるようになります。すなわち、`authors` フィールドに指定された公開鍵が `event.pubkey` と一致しなくても、イベントの委任元が `authors` に含まれているならばそれは正当なイベントとみなされます。

`acceptDelegatedEvent` はデフォルトでは無効になっています。

## Auto Expiration Check

[NIP-40](https://github.com/nostr-protocol/nips/blob/master/40.md) に基づいて、REQ の結果として返されたイベントが期限切れとなっていないかを自動で確認し、期限が切れているイベントを結果から除きます。

この挙動は `skipExpirationCheck` オプションで無効にできます。
