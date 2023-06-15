# RxNostr

## function

### createRxNostr() [#create-rx-nostr]

```ts
function createRxNostr(options?: Partial<RxNostrOptions>): RxNostr;

interface RxNostrOptions {
  retry: number;
  timeout: number;
}
```

## interface

### RxNostr [#rx-nostr]

```ts
interface RxNostr {
  getRelays(): Relay[];
  switchRelays(
    relays: (string | Relay)[] | Awaited<ReturnType<Nip07["getRelays"]>>
  ): void;
  addRelay(relay: string | Relay): void;
  removeRelay(url: string): void;
  hasRelay(url: string): boolean;
  getAllRelayState(): Record<string, ConnectionState>;
  getRelayState(url: string): ConnectionState;
  reconnect(url: string): void;
  use(rxReq: RxReq): Observable<EventPacket>;
  createAllEventObservable(): Observable<EventPacket>;
  createAllErrorObservable(): Observable<ErrorPacket>;
  createAllMessageObservable(): Observable<MessagePacket>;
  createConnectionStateObservable(): Observable<ConnectionStatePacket>;
  send(params: Nostr.EventParameters, seckey?: string): Observable<OkPacket>;
  dispose(): void;
}
```

#### getRelays() [#get-relays]

#### switchRelays() [#switch-relays]

#### addRelay() [#add-relay]

#### removeRelay() [#remove-relay]

#### hasRelay() [#has-relay]

#### getAllRelayState() [#get-all-relay-state]

#### getRelayState() [#get-relay-state]

#### reconnect() [#reconnect]

#### use() [#use]

#### createAllEventObservable() [#create-all-event-observable]

#### createAllErrorObservable() [#create-all-error-observable]

#### createAllMessageObservable() [#create-all-message-observable]

#### createConnectionStateObservable()

#### send()

#### dispose()
