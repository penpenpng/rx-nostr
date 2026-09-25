# Task 06: REQ protocol と query engine

## 目的

既存の forward/backward 上位ロジックを、実際の Nostr REQ/CLOSE と unipls recovery に接続する。

## 作業

- D13 に従い opaque vreq id、REQ subId allocator、active REQ registry を internal に実装し、query result には利用者指定 `traceTag` だけを伝播する。
- `LazyFilter` を実送信直前に評価し、Nostr REQ tuple を生成する。
- unipls `subscribe` selector/terminator を subId ごとに構成する。
- EVENT/EOSE/CLOSED を packet 化し、NOTICE/invalid message が query を誤終端しないようにする。
- local Rx unsubscribe、forward replacement、relay removal、EOSE、CLOSED、timeout、dispose の各経路で必要な `CLOSE` と cleanup を一度だけ行う。
- reconnect 時は active query を resend し、lazy filters を再評価する。old epoch の packet を無視する。
- forward: relay ごとに最大一つの current REQ、次 packet が以前を置換。
- backward: packet ごとの REQ を並行し、全対象 relay の EOSE/CLOSED/timeout 後に segment 完了。`over()` 後は全 segment 完了で Observable complete。
- dynamic session/segment RxRelays の既存 semantics を real adapter で検証する。
- filter matching、verification、expiration check を Task 01 で決めた順序へ接続する。
- D12 で NIP-11 `max_subscriptions` を初期 v4 に含めるなら queue を REQ planner 内に置く。含めない場合は behavior matrix で明示的に deferred とする。

## error/finalization policy

- relay-local drop/retry exhaustion はその relay segment を終端し、他 relay を継続する（D5 推奨案）。
- malformed EVENT、verifier exception、filter evaluator exception の扱いを混同しない。
- backward timeout を RxJS の未処理 error にせず、該当 relay の正常な query termination または typed state として扱う契約を固定する。
- empty destination は warning だけか即 complete かを strategy ごとに contract 化する。

## 受入条件

- public `req()` を使う `*.spec.ts` が forward/backward の wire messages と results を検証する。
- public query result から `subId`/`vreqId` を参照できず、同じ `traceTag` が relay や将来の REQ split をまたぐ logical correlation value になる。
- unsubscribe で正しい subId の CLOSE が送られる。
- reconnect 後の REQ で lazy `since`/`until` が再評価される。
- dynamic relay 追加時、未完了 query だけが新 relay へ送られる。
- filter mismatch、invalid signature、expired EVENT が option に従い drop される。
- query count/timer/listener が全終了経路で 0 に戻る。

## 非目標

- D9 で deferred とした automatic splitting/multiplexing
- COUNT query など REQ 以外の新規 high-level API

## 実装結果

2026-09-21 に完了。

- `RelayCommunication` は facade として connection demand、`RelayProtocolSession`、`RelayReqScheduler`、`RelayDirectoryBridge` を構成する。protocol session が vreq を REQ plan 群へ変換・集約し、scheduler が各 REQ に NIP-11 `max_subscriptions` slot を割り当てる。queue 待機中は timeout を開始せず、取消・zero capacity・dispose で未開始 REQ を残さない。
- lazy filter は初回送信と reconnect resend の直前に再評価する。filter callback 例外と verifier callback 例外は callback kind を保持した `RxNostrCallbackError` にする。
- backward の EOSE/CLOSED/timeout と relay-local transport failure はその relay segment だけを完了する。local unsubscribe、relay removal、forward replacement は対象 REQ subId に CLOSE を送り、remote terminal 後は重複 CLOSE を送らない。
- forward replacement は新 segment を開始してから旧 segment を終了する。empty destination は接続を作らず即 complete する。
- filter matching は relay へ実際に送った filter snapshot に対して行い、その後 verifier、NIP-40 expiration の順に処理する。公開 packet には指定時だけ `traceTag` を付け、subId/vreqId は含めない。
- pool entry の初回利用時に NIP-11 を自動取得する。`skipFetchNip11` は取得だけを無効化し、注入済み RelayDirectory metadata の利用は妨げない。
- public contract は複数 relay、forward replacement、backward completion、CLOSE、reconnect、filter callback、validation option、timeout、queue、empty destination、NIP-11 fetch を controlled WebSocket で検証する。
- `auth-required:` CLOSED は REQ slot を先に解放し、AUTH 後の再送を新しい subId の REQ として再度 queue に通す。reconnect recovery は同じ slot を予約して同じ subId を resend する。複数 REQ plan、AUTH 待機、reconnect、queued timeout と scheduler 単体の FIFO/cancel/zero/dispose を実装詳細 test で検証する。
