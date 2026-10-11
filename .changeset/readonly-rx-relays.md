---
"rx-nostr": major
---

Replace RxRelays.get() with toArray() and rename its set() mutation to replace(). Move static URL conversions to the internal RelayUrls utility. Return ReadonlyRxRelays from set operations, from(), and empty(), and accept readonly relay collections throughout relay inputs.
