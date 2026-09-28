---
"rx-nostr": major
---

Replace the strategy-bearing RxReq variants and RxNostr.req() with a strategy-free RxReq hot source plus RxNostr.forward() and RxNostr.backward(). Both query methods also accept filter arrays directly as cold, finite request sources.
