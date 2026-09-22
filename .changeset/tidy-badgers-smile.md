---
"rx-nostr": major
---

Release the redesigned v4 API with the directly constructible `RxNostr` class, structural `IRxNostr` interface, relay-first operations, explicit forward/oneshot REQ descriptors, authenticator-owned AUTH timeouts, namespaced process-wide constructor and operation defaults, transport lifecycle, query engine, publication operation, relay directory, and connection management model. Public result objects are exposed as detached mutable values while internal operation snapshots remain protected.
