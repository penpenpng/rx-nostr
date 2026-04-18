# Auto Filtering

rx-nostr automatically filters invalid events returned as a result of REQ. You can change these behavior by options of `createRxNostr()`.

## Auto Verification

rx-nostr automatically verifies signatures and excludes from the results events that fail verification. At the same time, it also verifies the validity of the delegation token if an event delegated under [NIP-26](https://github.com/nostr-protocol/nips/blob/master/26.md) exists.

You can disable this behavior by `skipVerify` option.

## Auto Validation

rx-nostr automatically verifies that the events returned as a result of REQ really match the REQ filters, and excludes events that fail verification from the results.

You can disable this behavior by `skipValidateFilterMatching` option.

::: tip Note
There is no standardized interpretation of the `search` field, so no validation of the field is performed.
:::

If Auto Validation is enabled and the `acceptDelegatedEvent` option is also enabled, then filtering by the `authors` field will also accept delegated events. That is, even if the public key specified in the `authors` field does not match `event.pubkey`, it will be considered a legitimate event if the event's delegate source is included in the `authors` field.

`acceptDelegatedEvent` is disabled by default.

## Auto Expiration Check

Based on [NIP-40](https://github.com/nostr-protocol/nips/blob/master/40.md), events returned as a result of REQ are automatically checked whether or not they are expired and removes expired events from the result.

You can disable this behavior by `skipExpirationCheck` option.
