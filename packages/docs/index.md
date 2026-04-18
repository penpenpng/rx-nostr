---
layout: home

hero:
  name: rx-nostr
  tagline: Supports high quality and flexible communication with multiple Nostr relays.
  actions:
    - theme: brand
      text: Document v3.x
      link: /en/v3/
    - theme: alt
      text: Document v2.x
      link: /en/v2/

features:
  - title: REQ Queuing
    details: Properly queue REQ requests so that concurrent REQ subscriptions do not exceed the limit.
  - title: WebSocket Reconnection
    details: Reconnect WebSocket under an appropriate back-off strategy, and properly restore REQ subscriptions.
  - title: Adaptive Relay Pool
    details: Reconfigure ongoing communications in response to changes in the relay pool.
  - title: Respect NIP-11 limitations
    details: Optimize behavior with respecting to NIP-11 limitation.
  - title: AUTH Support
    details: With only a few settings, gets fully compatible with AUTH based on NIP-42.
  - title: Integration with RxJS
    details: Seamless integration with RxJS. Take full advantage of RxJS's highly expressive declarative notation.
---
