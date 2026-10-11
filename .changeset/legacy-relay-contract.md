---
"rx-nostr": patch
---

Honor iterable and permission-aware legacy relay inputs, keep each legacy query subscription independent, retain selected lazy-keep connections, and preserve terminated connection status after disposal. Report empty destinations and failed `any-ok` sends as errors.
