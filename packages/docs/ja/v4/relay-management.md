# Relay Management

v4 では、operation の宛先と WebSocket 接続の寿命を別々に指定します。

- `relays` — REQ または EVENT を実際に送る宛先
- hot relay — operation がなくても接続を維持する集合
- `defer` / `weak` / `linger` — operation が接続需要を作る方法

hot relay は宛先ではありません。hot に設定しただけでは REQ や EVENT は送信されません。

## RelayInput

`req()`、`publish()`、`setHotRelays()` は次の値を受け取ります。

```ts
type RelayInput = string | Iterable<string> | RxRelays;
```

URL は正規化され、alias と重複がまとめられます。不正な URL は除外されます。

```ts
import { RxRelays } from "rx-nostr";

const relays = new RxRelays([
  "wss://RELAY.example.com/",
  "wss://relay.example.com",
  "invalid",
]);

console.log([...relays]); // ["wss://relay.example.com"]
```

## 動的な query 宛先

`RxRelays` を query の宛先に渡すと、集合の変更に追従して relay segment が追加、終了されます。

```ts
const relays = new RxRelays(["wss://one.example.com"]);
const request = new RxForwardReq();

const subscription = rxNostr.req(request, { relays }).subscribe(console.log);
request.emit([{}]);

relays.append("wss://two.example.com");
relays.remove("wss://one.example.com");

subscription.unsubscribe();
relays.dispose();
request.dispose();
```

backward query では、一度開始して終了した同じ relay segment を集合から除外して再追加しても再実行しません。新しい取得を行う場合は新しい ReqPacket を emit してください。

publish は動的集合に追従しません。`publish()` を呼んだ時点の宛先が operation 全体で使われます。

## Hot relay

頻繁に使うリレーへあらかじめ接続しておくには `setHotRelays()` を使います。

```ts
const hot = new RxRelays(["wss://relay.example.com"]);
rxNostr.setHotRelays(hot);

hot.append("wss://another.example.com");

// hot connection をすべて解放します。
rxNostr.unsetHotRelays();
hot.dispose();
```

hot relay は集合に含まれる間、長寿命の接続需要を保持します。query や publish の `linger` が終了しても、hot の需要が残っていれば WebSocket は閉じません。

## 接続需要 option

### `defer`

REQ 専用の option です。既定値は `true` で、最初の ReqPacket が emit されるまで接続しません。`false` にすると query を subscribe した時点で宛先を prewarm します。

### `weak`

既定値は `false` です。`true` の operation は新しい接続需要を作らず、hot relay や別の operation によって既に利用可能な接続だけを使います。切断中の relay に weak operation だけを指定しても接続は開始されません。

### `linger`

segment 終了後も接続需要を保持する時間です。既定値は 10,000 ms です。

- `0` — 終了後すぐ解放
- 正の有限値 — 指定時間だけ再利用可能な状態を維持
- `Infinity` — operation/session が dispose されるまで保持

`RxNostr.dispose()` と `Publication.cancel()` は linger を待たずにリソースを解放します。

## 集合演算

`RxRelays` は reactive な union、intersection、difference を作れます。

```ts
const publicRelays = new RxRelays(["wss://one.example.com"]);
const userRelays = new RxRelays(["wss://two.example.com"]);

const all = RxRelays.union(publicRelays, userRelays);
const onlyPublic = RxRelays.difference(publicRelays, userRelays);
const common = RxRelays.intersection(publicRelays, userRelays);
```

派生集合も不要になったら dispose してください。
