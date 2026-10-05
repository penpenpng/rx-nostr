# Query

`RxNostr.forward()` と `RxNostr.backward()` は Nostr の REQ を指定したリレーへ送り、検証済みの `EventPacket` を返す cold Observable です。呼び出すだけでは始まらず、subscribe ごとに独立した query を作ります。第1引数は宛先、第2引数は filter の配列または `RxReq`、第3引数は operation の設定です。単一 filter も配列に入れて渡します。

## 一度だけ過去イベントを取得する

`backward()` に filter 配列を渡します。全リレーで EOSE、CLOSED、timeout などによって処理が終わると Observable が complete します。

```ts
const result$ = rxNostr.backward(["wss://relay.example.com"], [
  { kinds: [0], authors: [pubkey] },
  { kinds: [1], authors: [pubkey], limit: 20 },
]);

result$.subscribe(console.log);
```

空の宛先を指定した query は接続を作らず complete します。空の filter 配列も接続を作りません。

filter は固定配列、`RxReq.emit()`、`RxReq.pipe()` の出力で同じ規則を使います。`[{}]` は全件に一致し、空の filter 配列 `[]` は一致なしです。`authors: []`、`ids: []`、`kinds: []`、`"#e": []` のような空の条件配列を含む filter は一致なしとしてその filter だけを除外します。複数 filter は OR なので、他の有効な filter があればその filter だけを送信します。

固定 filter は `forward()` / `backward()` の呼び出し時、`RxReq.emit()` の filter は emit 時に構造と条件配列を snapshot します。`pipe()` が packet を作り直す場合は query へ届いた時に再度正規化します。その後に元の配列を書き換えても送信する filter は変わりません。lazy な `since` / `until` の関数だけは参照を保持し、各送信・再送の直前に呼び出します。評価後の不正な範囲も送信せず、全件検索へ拡大しません。

未知の field、不正な値、`since > until` の filter も一致なしとして扱います。`since` / `until` の関数は送信時・再送時に評価し、評価後に時刻範囲が逆転した場合は REQ を送らずその segment を終了します。`limit: 0` は有効な値です。固定 filter がすべて一致なしなら Observable は接続せず complete します。`RxReq` の emit が一致なしの場合はその segment だけが終了し、source は次の emit を受け付けます。filter callback の例外は後述の error になります。

## 継続的に新着イベントを受け取る

`forward()` に固定 filter を渡します。EOSE を受け取っても完了せず、unsubscribe まで REQ を維持します。

```ts
const subscription = rxNostr
  .forward(["wss://relay.example.com"], [{ kinds: [1] }])
  .subscribe(({ event }) => console.log(event));

subscription.unsubscribe();
```

実行中に filter を差し替える場合は `RxReq` を使います。`forward()` では次の `emit()` が直前の REQ を置き換え、古い REQ には CLOSE が送られます。

```ts
import { RxReq } from "rx-nostr";

const request = new RxReq();
const subscription = rxNostr
  .forward(["wss://relay.example.com"], request)
  .subscribe(({ event }) => console.log(event));

request.emit([{ kinds: [1], since: Math.floor(Date.now() / 1000) }]);
request.emit([{ kinds: [6] }]);

subscription.unsubscribe();
request.dispose();
```

## ページごとの backward query

`backward()` に `RxReq` を渡すと、各 `emit()` は EOSE、CLOSED、timeout などまで独立して継続します。`request.dispose()` は新しい ReqPacket の供給を終えますが、進行中や queue 中の segment は完了まで残ります。通信をすぐ止める場合は query の subscription を unsubscribe します。

```ts
const request = new RxReq();

const subscription = rxNostr
  .backward(["wss://relay.example.com"], request)
  .subscribe({
    next: console.log,
    complete: () => console.log("all pages completed"),
  });

request.emit([{ kinds: [1], until: 1_700_000_000, limit: 50 }]);
request.emit([{ kinds: [1], until: 1_699_000_000, limit: 50 }]);
request.dispose();
```

`forward()` では source が dispose されても最後の segment は継続します。subscription の unsubscribe または `RxNostr.dispose()` で終了します。

`request.pipe(...)` で作った派生 `RxReq` は独立して dispose できます。派生を dispose するとその observer と遅延中の operator は終了しますが、親や兄弟の request は継続します。親を dispose すると子孫の派生も終了します。派生の `emit()` は破棄前には共有 source へ送信し、破棄後は何もしません。すでに終了した request への subscribe は直ちに complete します。派生を query に渡していた場合も、`forward()` の最後の REQ segment は上述のとおり継続するため、通信を止めるには query の subscription を unsubscribe してください。

## Lazy filter

`since` と `until` には関数を渡せます。実際に REQ を送る直前に評価され、再接続による再送時にも再評価されます。

```ts
request.emit([{ kinds: [1], since: () => Math.floor(Date.now() / 1000) }]);
```

関数が例外を投げた場合、query は `RxNostrCallbackError` で error になります。

## `ReqPacket` option

`emit()` の第2引数は REQ segment 単位の設定です。

```ts
request.emit([{ kinds: [1] }], {
  relays: ["wss://temporary.example.com"],
  linger: 0,
  traceTag: "home-timeline",
});
```

- `relays` — この segment の宛先を上書き
- `linger` — segment 終了後の接続需要の保持時間
- `traceTag` — 対応する `EventPacket` へコピーされる値

物理的な subscription ID は実装詳細です。問い合わせを識別する場合は `traceTag` を使ってください。

## 受信時の検査

EVENT は REQ filter との一致、`EventVerifier` による署名、NIP-40 の expiration の順で検査されます。

`@rx-nostr/crypto` と `@rx-nostr/crypto-wasm` の verifier はどちらも EVENT の内容から計算した ID と公開された `event.id` を比較し、署名も検証します。本体は暗号実装を選ばず、設定された `EventVerifier` を受信時に呼び出します。検証を意図的に省略する場合に限り `NoopVerifier` を明示してください。

```ts
rxNostr.backward(relays, [{}], {
  verifier: customVerifier,
  skipValidateFilterMatching: true,
  skipExpirationCheck: true,
});
```

filter に一致しないイベント、署名が不正なイベント、期限切れのイベントは既定では通知されません。

## リレーごとの失敗

ひとつのリレーにおける timeout、切断、CLOSED、retry の枯渇は、そのリレーの segment だけを終了します。別のリレーが結果を返せる間は merged query 全体を error にしません。

`backward()` の `timeout` は REQ が NIP-11 queue から実際に送信された時点で始まります。`0` は即時 timeout、`Infinity` は無期限です。
