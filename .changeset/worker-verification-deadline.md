---
"rx-nostr": patch
---

Measure Worker verification timeouts from each request's start, remove the shared interval, and validate timeout values.

The same timeout and client-disposal guarantees apply to fallback verification during Worker startup or failure. Late fallback results are ignored without taking ownership of the injected fallback verifier.
