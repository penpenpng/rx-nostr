# OkPacket Operators

[[TOC]]

## filterByEventId()

Only the OkPacket corresponding to a given event ID is extracted and the others are eliminated.

Since `rxNostr.send()` will only receive OK messages for a single issued event, it is usually not necessary to use it.
