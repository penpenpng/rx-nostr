---
"rx-nostr": patch
---

Reject Worker verification requests when the verifier throws, preserving the distinction between a processing failure and a valid `false` result.
