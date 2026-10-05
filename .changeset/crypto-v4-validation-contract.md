---
"@rx-nostr/crypto": major
"@rx-nostr/crypto-wasm": major
---

Align the v4 cryptographic contract with rx-nostr v4. Verification rejects malformed EVENT fields, noncanonical ID/public-key/signature encodings, and IDs that do not match the event contents. `SeckeySigner` re-signs an already signed EVENT when configured tags change its contents. The optional `rx-nostr` peer range moves to v4.
