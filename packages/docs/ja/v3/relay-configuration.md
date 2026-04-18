# Relay Configuration

`RxNostr` が実際に通信するリレーセットはいくつかの方法で指定できますが、もっとも基本的な方法は **デフォルトリレー** を設定することです。

## Default Relays

デフォルトリレーは `rxNostr.setDefaultRelays()` を使って設定できる、読み書き権限の指定を伴うリレーのセットです。特に権限を指定しなかった場合には両方が許可されたものとして扱われます。

`rxNostr.send()` および `rxNostr.use()` を後述する一時リレーを指定せずに実行する場合には、ここで登録されたデフォルトリレーが使用されます。

```ts
import { createRxNostr } from "rx-nostr";

const rxNostr = createRxNostr();
rxNostr.setDefaultRelays([
  "wss://nostr1.example.com",
  "wss://nostr2.example.com",
  "wss://nostr3.example.com",
]);
```

権限を指定する場合には以下のようにします:

```ts
rxNostr.setDefaultRelays([
  // Readonly
  {
    url: "wss://nostr1.example.com",
    read: true,
  },
  // Writeonly
  {
    url: "wss://nostr1.example.com",
    write: true,
  },
]);
```

NIP-07 インターフェースが利用できる場合にはその返り値を直接渡すこともできます:

```ts
rxNostr.setDefaultRelays(await window.nostr.getRelays());
```

### Reactivity

デフォルトリレー上での通信は、読み取りについて反応的かつ適応的です。すなわち、デフォルトリレーの変更は現在確立している REQ サブスクリプションに直ちに反映されます。

より詳しく説明すると、今すでにデフォルトリレーの上で REQ サブスクリプションが存在しているとしてデフォルトリレーの構成に変更を加えると、新しいデフォルトリレーのもとではもはや読み取りが許可されなくなったリレーでの REQ は直ちに CLOSE され、逆に新しく読み取りが可能になったリレーに対しては同等の REQ が自動的に送信されます。

デフォルトリレーの変更は、後述する一時リレーの上での通信には影響しません。

## Temporary Relays

`rxNostr.send()` や `rxNostr.use()` などの第二引数に `on` オプションを渡すことによって、**一時リレー** の上で通信することができます。一時リレーは [Connection Strategy](./connection-strategy) の設定に関わらず、必要な間だけ接続され不要になると切断されます。

一時リレーの指定はデフォルトリレーにおける権限設定を**尊重しません**。つまり、デフォルトリレーに何が指定されていようと、一時リレーに対して書き込みないし読み取りを実行します。

### Publish on Temporary Relays

`rxNostr.send()` の第二引数に `on` オプションを渡すと一時リレーに対してイベントを送信することができます。
例えば次の例では、デフォルトの書き込み先リレーに加えて `wss://example.com` にもイベントを送信します。

```ts
rxNostr.send(
  { kind: 1, content: "Hello" },
  {
    on: {
      relays: ["wss://example.com"],
      defaultWriteRelays: true,
    },
  },
);
```

一時リレーは書き込みにかかる通信の間、言い換えると EVENT を発行してから OK を受け取るまでの間だけ接続され、それが終わると (ほかのデフォルトリレーや一時リレーとして使われていない限り) 切断されます。

### Subscribe on Temporary Relays

読み取りにおける一時リレーは `rxNostr.use()` の `on` オプションで指定する **use scope** と `rxReq.emit()` の `relays` オプションで指定する **emit scope** の 2 種類が存在し、より狭いスコープの指定 (つまり emit scope) が優先されます。

一時リレーは読み取りにかかる通信の間、言い換えると REQ を発行してから CLOSE されるまでの間だけ接続され、それが終わると (ほかのデフォルトリレーや一時リレーとして使われていない限り) 切断されます。
