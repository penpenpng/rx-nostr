---
"rx-nostr": patch
---

Make derived `RxReq` views dispose independently, stopping their observers and operator work while preserving parent and sibling requests.
