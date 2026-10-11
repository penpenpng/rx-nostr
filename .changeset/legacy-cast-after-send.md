---
"rx-nostr": patch
---

Wait for an actual EVENT send before completing the legacy `cast()` and `send(..., { completeOn: "sent" })` APIs. Pending connections and authentication no longer report premature success, and all failed sends reject the operation.
