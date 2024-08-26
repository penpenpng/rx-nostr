---
sidebarDepth: 0
---

# General Operators

汎用的な Operator のリファレンスです。

[[TOC]]

## completeOnTimeout()

一定時間何も観測しない時間が続いたときに Observable を complete します。

::: tip Note
[`timeout()`](https://rxjs.dev/api/operators/timeout) は complete ではなく error で終了します。
:::

## sort()

[`sortEvents()`](./event-packet-operators.html#sortevents) の、より汎用的なバリエーションです。

## filterBySubId()

与えられた値と合致する `subId` を持つ Packet のみ抽出し、それ以外を排除します。`EventPacket`, `EosePacket`, `ClosedPacket`, `CountPacket` の Observable で利用可能です。
