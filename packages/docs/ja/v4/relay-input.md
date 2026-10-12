# Relay Input

rx-nostr で行われるいくつかの操作ではリレー集合の指定が必要になることがあります。例えば、イベントを発行するメソッド `publish()` では宛先リレーの指定が必要です。

このようなメソッドは `RelayInput` 型を受け入れるようになっています。

```ts
type RelayInput =
  | string
  | readonly string[]
  | ReadonlySet<string>
  | ReadonlyRxRelays;
```

`RelayInput` 型はリレーの集合を表現します。特に、後述する `RxRelays` は動的なリレー集合を表現します。

```ts
import { RxRelays } from 'rx-nostr';

// 要素数1の静的なリレー集合
const input1: RelayInput = 'wss://relay.example.com';

// 静的なリレー集合
const input2: RelayInput = [
  'wss://relay-1.example.com',
  'wss://relay-2.example.com',
];
const input3: RelayInput = new Set([
  'wss://relay-1.example.com',
  'wss://relay-2.example.com',
]);

// 動的なリレー集合
const input4: RelayInput = new RxRelays();
```

`RelayInput` を受け入れる操作では、URL の正規化と重複排除、不正形式 URL の除外が暗黙のうちに行われます。ここで不正形式 URL と言うのは、文字列としての URL の形式を検査しているだけで、実際に URL の宛先を検査しているわけではないことに注意してください。

```ts
import { RxRelays } from "rx-nostr";

// RxRelays 自身も初期化子として RelayInput を受け取ります
const relays = new RxRelays([
  "wss://relay.example.com",
  "wss://RELAY.example.com/", // 正規化された結果重複するので排除されます
  "invalid", // 形式が不正なので排除されます
]);
```

## 動的なリレー集合

`RxRelays` は動的なリレー集合を表現します。`RxRelays` の利用者は、この `RxRelays` に加えられた変更を購読することができます。

ある操作が動的なリレー集合を与えられたときにどのように振る舞うかは、操作によって異なります。例えば、リレーからイベントを取得するメソッド `forward()` は、動的なリレー集合を与えられるとリレー集合の変化に反応して購読先を動的に変更します。

```ts
const relays = new RxRelays(['wss://relay.example.com']);

rxNostr
  .forward(relays, [{ kinds: [1] }])
  .subscribe(console.log);

// 動的なリレー集合に後からリレーを追加すると `forward()` はそれに追従します
relays.append('wss://another-relay.example.com');
```


`RelayInput` を受け入れるすべての操作が動的なリレー集合に対して特別な振る舞いをするわけではないことには注意してください。イベントを発行するメソッド `publish()` は `RxRelays` も受け入れますが、宛先リレーは `publish()` を呼び出した瞬間のリレー集合のスナップショットで決定するので、リレー集合の動的な変更は意味をなしません。

## RxRelays

`RxRelays` は JavaScript 標準の [Set](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set) を意識した API を備えています。

### 集合の更新

`append()`, `remove()`, `clear()` を備えます。入力された URL は正規化されます。

```ts
relays.append('wss://relay.example.com');
relays.remove('wss://relay.example.com');
relays.clear();
```

また、標準の Set と異なり `replace()` を備えています。これは `clear()`, `append()` を逐次的に呼び出すのに似ていますが、中間状態としての空集合を購読者に通知しない点で異なります。

```ts
relays.replace(
  'wss://relay-1.example.com',
  'wss://relay-2.example.com'
);
```

### 集合演算

集合演算として `union()`, `intersection()`, `difference()` を備えます。ただし、標準の Set と異なり、これはインスタンスメソッドではなく静的メソッドであって、常に新しい派生集合 `ReadonlyRxRelays` を作成します。`ReadonlyRxRelays` では `append()`, `remove()`, `clear()`, `replace()` は使用できません。

このようにして作られた派生集合は、上流の変化に追従します。

```ts
const relays1 = new RxRelays([
  'wss://one-a.example.com',
  'wss://one-b.example.com',
]);

const relays2 = new RxRelays([
  'wss://two-a.example.com',
]);

const relays = RxRelays.union(relays1, relays2);

// この変更は relays の購読者に通知される
relays2.append('wss://two-b.example.com');
```

上流の集合が破棄 (`dispose()`) されたとき、下流の派生集合はそれが空集合に更新されたものとして扱います。上流の集合がすべて破棄されたとしても、下流の派生集合が自動で破棄されることはありません。

### 読み取り

`RxRelays` が表現している現在のリレー集合はいくつかの方法で読み取ることができます。

- `toArray()`: 配列に変換します。出力は正規化され、重複が排除されています。
- `has(url)`: あるリレーが集合に含まれるかを確かめます。
- `size`: 集合の大きさを返します。

`RxRelays` は iterator を備えているので、spread 構文や for 文などでも読み取れます。

```ts
const relays = new RxRelays();

// spread 構文
const array = [...relays];

// for 文
for (const relay of relays) {
  // ...
}
```

`subscribe()` を使えば変更を購読できます。他の購読と同様、使用されなくなったあとは `unsubscribe()` される必要があります。

### RxRelays の破棄

使用されなくなった `RxRelays` は `dispose()` によって破棄されるのが望ましいです。
