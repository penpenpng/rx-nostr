# Packets

## interface

### ReqPacket [#req-packet]

```ts
type ReqPacket = Nostr.Filter[] | null;
```

### EventPacket [#event-packet]

```ts
interface EventPacket {
  from: string;
  subId: string;
  event: Nostr.Event;
}
```

### ErrorPacket [#error-packet]

```ts
interface ErrorPacket {
  from: string;
  reason: unknown;
}
```

### MessagePacket [#message-packet]

```ts
interface MessagePacket {
  from: string;
  message: Nostr.IncomingMessage.Any;
}
```

### OkPacket [#ok-packet]

```ts
interface OkPacket {
  from: string;
  id: string;
}
```

### ConnectionStatePacket [#connection-state-packet]

```ts
interface ConnectionStatePacket {
  from: string;
  state: ConnectionState;
}

type ConnectionState =
  | "not-started"
  | "starting"
  | "ongoing"
  | "reconnecting"
  | "error"
  | "terminated";
```
