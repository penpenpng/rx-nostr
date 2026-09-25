# v4 アーキテクチャ

## 目的と責務境界

v4 は「WebSocket application の信頼できる伝送」と「Nostr protocol の意味付け」を分離します。

```text
Application
  | RxJS Observable / RxReq / RxRelays
  v
RxNostr facade
  | destination planning, verification, progress aggregation
  v
per-instance RelayPool
  | one RelayCommunication per normalized relay URL (v4 initial scope)
  v
Nostr protocol adapter
  | REQ/CLOSE/EVENT/AUTH, subId, EOSE, OK, packet codec
  v
unipls
  | WebSocket, readiness, drop detection, retry, timeout, resource lifecycle
  v
WebSocket implementation

Global/injected RelayDirectory observes relay metadata and health beside this path;
it does not own sockets or choose query destinations.
```

### unipls の責務

- WebSocket construction and event wiring
- logical session / transport connection lifecycle
- disconnect detection and stale transport isolation
- reconnect scheduling contract
- operation timeout/abort and transport-level resend
- serialization boundary and resource cleanup

rx-nostr から `WebSocket` を直接生成・監視してはいけません。
また、unipls の class/interface は rx-nostr の public API に露出させず、transport adapter の内部実装に閉じ込めます。

### rx-nostr の責務

- Nostr message の encode/decode と validation
- logical vreq から physical REQ/subId への変換
- REQ/CLOSE、EOSE、CLOSED、EVENT の lifecycle
- EVENT publish、OK、AUTH challenge と NIP-42 retry
- relay destination の動的変更
- hot/weak/defer/linger の connection demand
- NIP-11 metadata と relay health の集約
- event verification、filter matching、expiration filtering
- RxJS API と複数 relay の結果集約

## 中心概念

### RxRelays

通信先 relay URL の reactive な集合です。connection pool や socket を所有しません。query 全体の既定集合と個々の `ReqPacket` の上書き集合の両方に利用できます。

### RelayPool

ひとつの `RxNostr` instance が所有する normalized URL -> `RelayCommunication` の map です。v4 初期リリースでは同じ instance/URL に一つの `RelayCommunication` と一つの unipls client を持ちます。将来の多重化は `RelayCommunication` 内の planner/physical connection 層で追加し、上位 API を変えません。

初期 v4 では idle entry の eviction は行わず、RxNostr instance の dispose まで entry を保持します。これにより active lease/query の誤 eviction と、同じ URL の再生成による transport state の分裂を避けます。idle eviction が必要になった場合は、lease count と active protocol operation の両方を確認する pool 内部 policy として追加します。

### RelayCommunication

単一 relay に対する Nostr protocol adapter です。次を所有します。

- unipls client
- connection demand の lease count
- physical subId allocator と active query registry
- RelayDirectory の `maxSubscriptions` に従う physical query queue
- Nostr message codec
- AUTH coordinator
- RelayDirectory への lifecycle/health report

外部へは当面 `hold()`、`vreq()`、`event()`、state observation だけを見せます。unipls や WebSocket の型を query module へ漏らしません。

### connection lease と hot relays

query、publish、hot relay はすべて同じ lease を取得します。最初の lease で unipls session を `open()` し、最後の lease が解放された後に linger policy に従って `close()` します。

最後の lease の release は close を microtask まで保留します。同じ turn で lease が再取得された場合は close を取り消すため、動的 relay の remove/re-add や forward segment の交代で不要な socket blink を起こしません。より長い `linger` は connection demand scope が lease 自体を保持し続けることで表現します。

- hot relay: hot 集合に含まれる間、長寿命 lease を保持
- normal query: segment 中 lease を保持
- `defer: false`: 最初の segment より前に prewarm lease を取得
- `defer: true`: segment 開始時まで lease を取得しない
- `weak: true`: lease を取得せず、既に ready な connection だけを利用
- `linger`: segment 終了から lease 解放までの猶予。hot lease には影響しない

hot relay は宛先ではありません。hot だが query の `RxRelays` に含まれない relay へメッセージを送ってはいけません。

### vreq と physical REQ

vreq は RxNostr 内部の logical query、REQ は relay に送る Nostr message です。v4 初期リリースでは原則 1 vreq -> 1 physical REQ / relay としますが、両者を別の型と registry で扱います。

この境界により、将来次を追加できます。

- filter 数/サイズ/NIP-11 制限による一つの vreq の分割
- 複数 physical connection への配置
- NIP-11 `max_subscriptions` に基づく queue
- relay ごとの query rewriting

subId と vreqId は内部識別子であり、公開 query result には含めません。application が logical query を対応付ける必要がある場合は、利用者が `ReqPacket` に指定した `traceTag` をそのまま result へ伝播します。

### RelayDirectory

relay URL 自体に紐づく共有 metadata を持ち、socket を所有しません。

候補となる情報は次です。

- normalized URL
- NIP-11 data、取得時刻、取得失敗時刻
- 最終接続成功時刻
- 最終 drop/接続失敗時刻と分類
- 連続失敗回数
- 現在観測される connection 数（複数 RxNostr instance の合計）

connection の再試行を直接命令する API は、directory と pool の責務を再結合するため置きません。connection lifecycle の書き込みは internal reporter に限定し、public entry は内部状態から切り離した mutable snapshot として公開します（D2）。

## protocol flow

### REQ

1. `RxNostr.req()` の subscription ごとに connection demand scope を作る。
2. RxRelays の差分から relay segment を開始/終了する。
3. segment は relay lease と physical subId を取り、NIP-11 subscription limit に空きがなければ relay-local FIFO queue で待つ。
4. queue から開始すると unipls `subscribe()` へ lazy query factory を渡し、実送信直前と resend 時に `LazyFilter` を評価する。backward timeout はこの時点から開始する。
5. selector は同じ subId の EVENT/EOSE/CLOSED だけを受ける。
6. backward は EOSE/CLOSED/timeout で終端、forward は次の ReqPacket または unsubscribe まで継続する。
7. local unsubscribe 時、現在 ready な connection 上の active physical REQ には Nostr `CLOSE` を enqueue してから local handle を解放する。既に drop 済みなら stale connection へは送らない。
8. packet は filter match、signature、NIP-40 の順序を明示した pipeline を通し、internal subId/vreqId を除いて利用者指定 `traceTag` を付与する。

RelayPool は URL の entry を初めて作る際、既定で RelayDirectory の cached NIP-11 fetch を開始します。metadata 取得は query の送信をブロックせず、取得後の `maxSubscriptions` は以後の queue drain に反映されます。`skipFetchNip11` はこの自動取得だけを止め、既存 metadata による制限は維持します。

### publish

1. `publish()` は一つの publication operation object を返し、開始時の宛先 relay を snapshot する。
2. signer を一度実行し、実際に送信する EVENT の immutable snapshot を内部に保持し、利用者には detached mutable copy を返す。
3. 宛先 relay ごとに lease と publish operation を作る。
4. unipls で EVENT を送信し、同じ event id の OK を待つ。
5. AUTH-required response の場合は AUTH coordinator の結果を待って EVENT を再送する。
6. publication object は raw `OkPacket` の subscription、明示的 cancel、all/any policy の Promise、EVENT snapshot 取得を提供する。
7. OK subscription の unsubscribe は観測だけを終了し、送出努力の終了は `cancel()` または RxNostr dispose が担う。

Publication は relay ごとの `pending | accepted | failed` table を一つだけ持ち、raw OK replay と all/any settlement を同じ状態から導出します。AUTH-related `OK false` は table を terminal にせず、認証後の再送結果を待ちます。relay-local timeout/drop/rejection は failure snapshot に変換し、別 relay の subscription を操作しません。署名失敗だけが operation-wide error です。

terminal 後は各 segment の linger を維持し、finite linger cleanup 後に RxNostr の temporary resource registry から外れます。明示 cancel と instance dispose は linger を待たず、subscription、AUTH waiter、timer、lease を即時解放します。

### reconnect

- socket の再接続時期と terminal 判定は unipls reconnector が決める。
- active REQ/EVENT の resend 内容は rx-nostr が unipls operation の recovery policy/query factory を通じて決める。
- lazy filter は resend の直前に再評価する。
- RelayDirectory は lifecycle event を観測して health を更新するが、reconnect engine にはならない。
- 公開 connection state と RelayDirectory health は同じ unipls lifecycle transition から導出する。`monitorConnectionState()` は監視だけでは pool entry を作らず、既存および後から作られた entry の最新 snapshot を relay ごとに replay する。
- retry policy には triggering failure を記録した後の RelayDirectory aggregate health を渡すが、decision の実行主体と connection ownership は各 RxNostr instance/unipls session に留める。

### AUTH

- RelayCommunication ごとの coordinator が transport message stream から最新 AUTH challenge を保持する。challenge は connection generation に紐づき、drop/reconnect で無効化する。
- operation は `auth-required:` CLOSED/OK を受けたときだけ coordinator へ参加する。同じ challenge の参加者は署名、AUTH送信、OK待機を共有するが、`authenticator: false` の operation は参加しない。
- coordinator は kind 22242 event を `['AUTH', event]` として送り、その event id の OK を attempt を開始した Authenticator の `authTimeout` まで待つ。成功した generation は後続 operation が共有できる。
- AUTH成功後の元 operation 再送は各 physical REQ/EVENT が一度だけ管理する。coordinator 自身は query/publish state を所有しない。
- 各参加者は AbortSignal を持ち、最後の waiter が外れれば共有 attempt を中止する。新 challenge、reconnect、dispose も旧 attempt を abort/stale にし、古い結果で operation を再開しない。

## 不変条件

実装と contract test は少なくとも次を守ります。

1. v4 production code は WebSocket を直接触らない。
2. 全 URL は境界で一度 normalize し、以降は branded `RelayUrl` を使う。
3. RxRelays は destination、lease は connection lifetime、RelayDirectory は metadata を表し、相互に代用しない。
4. relay 一つの drop が別 relay の query/publish を巻き込まない。
5. 同じ physical REQ に `CLOSE` を高々一回送り、local resources も高々一回解放する。
6. reconnect 後の古い connection から届いた message は query state を変更しない（unipls epoch isolation を利用）。
7. query factory、signer、verifier、authenticator の例外は分類され、unhandled rejection にしない。
8. dispose は冪等で、新しい operation を拒否し、socket/subscription/timer/listener を残さない。
9. RelayDirectory の永続 snapshot に live handle、timer、unknown error object を入れない。
10. 実装詳細テストは `*.test.ts`、公開契約テストは public entry point だけを使う `*.spec.ts` とする。
11. rx-nostr の public declaration に unipls の型を露出させない。
12. query result に physical subId または logical vreqId を露出させない。

## RxNostr lifecycle

RxNostr instance は disposal gate と active Publication registry を facade に持ちます。dispose 順序は次のとおりです。

1. gate を閉じ、以後の mutator/publish と cold operation subscription を拒否する。
2. facade の dispose signal で active REQ を complete する。
3. active Publication を cancel し、send/AUTH/retry/timeout と publication lease を止める。
4. RelayWarmer を dispose して hot lease を解放する。
5. RelayPool を dispose し、各 RelayCommunication、transport、state observer を終端する。

pool は instance local であり、同じ relay URL を使う複数 instance も別 socket/session を持ちます。共有可能なのは注入した RelayDirectory の metadata/health record だけです。

## 明示的な初期スコープ外

- 一つの relay URL に対する physical WebSocket 多重化
- 一つの vreq の複数 REQ への自動分割
- durable storage adapter の同梱と自動保存
- relay 選択の scoring/recommendation engine
- unipls 自体の API 変更

これらを後から追加できる seam は今作りますが、v4 初期完成条件には含めません。
