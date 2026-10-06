---
"@rx-nostr/crypto-wasm": patch
---

Build the JavaScript entry point with the filename declared in the package exports so the published package can be imported.

Expose the generated declaration entry through package exports and exclude test sources from the tarball.
