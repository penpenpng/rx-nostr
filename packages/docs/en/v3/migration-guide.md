# Migration Guide

If you are considering migrating from rx-nostr v2, the major changes are summarized in the [Release Notes](https://github.com/penpenpng/rx-nostr/releases/tag/v3.0.0). The following is a minimum list of what you will need to review in order to migrate.

- All crypto-related dependencies have been moved to the rx-nostr-crypto package. If you were using the built-in verifier or signer, please use the ones exported from the rx-nostr-crypto package.
- The `verifier` option of `createRxNostr()` is now required. If you have previously omitted this option, use the `verifier` exported in the rx-nostr-crypto package.
- `EventVerifier` has been changed to an asynchronous function.
- All features marked as deprecated have been removed. JSDoc comments in v2 indicate the methods to migrate to, so please follow the directions and update your code.
- [NIP-26](https://github.com/nostr-protocol/nips/blob/master/26.md) related functions have been removed.
- `rxNostr.send()` no longer terminates as an error in the case of timeout. This behavior can be optionally changed; specify `errorOnTimeout: true` if you prefer the behavior up to v2.
