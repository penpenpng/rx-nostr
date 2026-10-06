---
"rx-nostr": patch
---

Reject invalid `timeline()` limits instead of silently truncating the accumulated event list in surprising ways. Preserve one-shot relay iterables in `batch()` output packets, emit explicitly configured falsy `timeoutWith()` fallbacks, and isolate `setDiff()` input/output sets and per-subscriber state.
