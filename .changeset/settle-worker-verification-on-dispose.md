---
"rx-nostr": patch
---

Reject pending Worker verification requests when the client is disposed or the Worker fails, and release their timeout callbacks and listeners.
