# Query

`rxNostr.req()` は Nostr の REQ を複数リレーへ送り、検証済みの `EventPacket` を返す cold Observable です。`req()` を呼ぶだけでは operation は始まらず、subscribe ごとに独立した query が作られます。

## One-shot query

フィルターまたはフィルターの配列を直接渡すと、backward strategy の one-shot query になります。

```ts
const result$ = rxNostr.req(
  [
    { kinds: [0], authors: [pubkey] },
    { kinds: [1], authors: [pubkey], limit: 20 },
  ],
  { relays: ["wss://relay.example.com"] },
);

result$.subscribe(console.log);
```

空の宛先を指定した query は接続を作らず complete します。

## Forward query

これから到着するイベントを継続的に購読するには `RxForwardReq` を使います。`emit()` するたびに直前の REQ が新しい REQ に置き換わり、古い REQ には CLOSE が送られます。

```ts
import { RxForwardReq } from "rx-nostr";

const request = new RxForwardReq();
const subscription = rxNostr
  .req(request, { relays: ["wss://relay.example.com"] })
  .subscribe(({ event }) => console.log(event));

request.emit([{ kinds: [1], since: Math.floor(Date.now() / 1000) }]);

// 以前の REQ を閉じ、kind 6 の REQ に置き換えます。
request.emit([{ kinds: [6] }]);

subscription.unsubscribe();
request.dispose();
```

## Backward query

過去へ向かう pagination など、複数の REQ を並行させる場合は `RxBackwardReq` を使います。各 `emit()` は EOSE、CLOSED、timeout などまで独立して継続します。新しい REQ をもう発行しないことを `over()` で通知すると、既存の全 REQ が終わった時点で Observable も complete します。

```ts
import { RxBackwardReq } from "rx-nostr";

const request = new RxBackwardReq();

rxNostr
  .req(request, { relays: ["wss://relay.example.com"] })
  .subscribe({
    next: console.log,
    complete: () => console.log("all pages completed"),
  });

request.emit([{ kinds: [1], until: 1_700_000_000, limit: 50 }]);
request.emit([{ kinds: [1], until: 1_699_000_000, limit: 50 }]);
request.over();
```

## Lazy filter

`since` と `until` には関数を渡せます。関数は実際に REQ を送る直前に評価され、再接続による再送時にも再評価されます。

```ts
request.emit([
  {
    kinds: [1],
    since: () => Math.floor(Date.now() / 1000),
  },
]);
```

関数が例外を投げた場合、query は `RxNostrCallbackError` で error になります。

## `ReqPacket` option

`emit()` の第2引数では、REQ segment 単位の option を指定できます。

```ts
request.emit([{ kinds: [1] }], {
  relays: ["wss://temporary.example.com"],
  linger: 0,
  traceTag: "home-timeline",
});
```

- `relays` — この segment だけ operation の宛先を上書きする
- `linger` — この segment 終了後に接続需要を保持する時間
- `traceTag` — 対応するすべての `EventPacket` へコピーされる値

物理的な subscription ID は実装詳細です。アプリケーション側で問い合わせを識別する場合は `traceTag` を利用してください。

## 受信時の検査

EVENT は次の順序で処理されます。

1. REQ filter との一致を検査
2. `EventVerifier` で署名を検証
3. NIP-40 の expiration を検査

各検査は次の option で変更できます。

```ts
rxNostr.req([{}], {
  relays,
  verifier: customVerifier,
  skipValidateFilterMatching: true,
  skipExpirationCheck: true,
});
```

filter に一致しないイベント、署名が不正なイベント、期限切れのイベントは既定では通知されません。

## Relay-local failure

ひとつのリレーにおける timeout、切断、CLOSED、retry の枯渇は、そのリレーの segment だけを終了します。別のリレーが結果を返せる間は、merged query 全体を error にしません。

backward query の `timeout` は REQ が NIP-11 queue から実際に送信された時点で始まります。`0` は即時 timeout、`Infinity` は無期限です。
