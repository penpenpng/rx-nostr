---
"rx-nostr": patch
---

Make derived `RxReq` views dispose independently, stopping their observers and operator work while preserving parent and sibling requests.

Disposal is also checked when subscribing to an Observable obtained earlier, so a disposed derived request or ancestor cannot start new query segments through a saved stream.
