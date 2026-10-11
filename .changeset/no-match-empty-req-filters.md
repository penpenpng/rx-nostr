---
"rx-nostr": patch
---

Apply the same REQ filter normalization to static, emitted, and piped requests. Empty condition lists and invalid filter branches now match nothing instead of expanding into an unrestricted query.
