# Operator

## function

### uniq() [#uniq]

```ts
function uniq(
  flushes?: ObservableInput<unknown>
): MonoTypeOperatorFunction<EventPacket>;
```

### latest() [#latest]

```ts
function latest(): MonoTypeOperatorFunction<EventPacket>;
```

### latestEach() [#latest-each]

```ts
function latestEach<K>(
  key: (packet: EventPacket) => K
): MonoTypeOperatorFunction<EventPacket>;
```

### verify() [#verify]

```ts
function verify(): MonoTypeOperatorFunction<EventPacket>;
```

### filterKind() [#filter-kind]

```ts
function filterKind<K extends Nostr.Kind>(
  kind: K
): MonoTypeOperatorFunction<EventPacket>;
```

### batch() [#batch]

```ts
function batch(
  mergeFilter: MergeFilter
): OperatorFunction<ReqPacket[], ReqPacket>;

type MergeFilter = (a: Nostr.Filter[], b: Nostr.Filter[]) => Nostr.Filter[];
```

### chunk() [#chunk]

```ts
function chunk(
  predicate: (f: Nostr.Filter[]) => boolean,
  toChunk: (f: Nostr.Filter[]) => Nostr.Filter[][]
): MonoTypeOperatorFunction<ReqPacket>;
```

### completeOnTimeout() [#complete-on-timeout]

```ts
function completeOnTimeout<T>(time: number): MonoTypeOperatorFunction<T>;
```
