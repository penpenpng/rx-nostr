# Relay Input

## RelayInput

`forward()`、`backward()`、`publish()`、`setHotRelays()` は次の値を受け取ります。

```ts
type RelayInput = string | readonly string[] | ReadonlySet<string> | RxRelays;
```

固定宛先は配列または Set に限ります。generator・iterator・任意の iterable は受け付けません。必要なら呼び出し側で `[...generator]` に変換してください。`RxReq.emit()` の `relays` option と RxRelays の変換メソッドも同じ入力型です。

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

`get()` は呼び出しごと、`subscribe()` / `asObservable()` と `RxRelays.observable()` は購読者ごとに変更可能な独立した `Set` を返します。受け取った Set を変更しても元の集合や別の購読者には影響しません。集合を変更するには `set()`、`append()`、`remove()`、`clear()` を使います。

```ts
import { RxReq } from "rx-nostr";

const relays = new RxRelays(["wss://one.example.com"]);
const request = new RxReq();

const subscription = rxNostr.forward(relays, request).subscribe(console.log);
request.emit([{}]);

relays.append("wss://two.example.com");
relays.remove("wss://one.example.com");

subscription.unsubscribe();
relays.dispose();
request.dispose();
```

backward query では、一度開始して終了した同じ relay segment を集合から除外して再追加しても再実行しません。新しい取得を行う場合は新しい ReqPacket を emit してください。

publish は動的集合に追従しません。`publish()` を呼んだ時点の宛先が operation 全体で使われます。

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
