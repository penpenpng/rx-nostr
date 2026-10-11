---
"@rx-nostr/crypto": patch
"@rx-nostr/crypto-wasm": patch
---

Re-sign already signed events when SeckeySigner appends configured tags, keeping IDs and signatures consistent with the final payload.
