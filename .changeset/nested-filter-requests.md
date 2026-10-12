---
"rx-nostr": minor
---

Separate forward and backward request input types, and accept nested filter arrays in backward as a finite sequence of REQ segments. Backward merges their events and completes once all segments finish.
