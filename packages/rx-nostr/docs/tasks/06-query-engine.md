# Task 06: REQ protocol と query engine

## 目的

既存の forward/backward 上位ロジックを、実際の Nostr REQ/CLOSE と unipls recovery に接続する。

## 作業

- D13 に従い opaque vreq id、physical subId allocator、active physical query registry を internal に実装し、query result には利用者指定 `traceTag` だけを伝播する。
- `LazyFilter` を実送信直前に評価し、Nostr REQ tuple を生成する。
- unipls `subscribe` selector/terminator を subId ごとに構成する。
- EVENT/EOSE/CLOSED を packet 化し、NOTICE/invalid message が query を誤終端しないようにする。
- local Rx unsubscribe、forward replacement、relay removal、EOSE、CLOSED、timeout、dispose の各経路で必要な `CLOSE` と cleanup を一度だけ行う。
- reconnect 時は active query を resend し、lazy filters を再評価する。old epoch の packet を無視する。
- forward: relay ごとに最大一つの current physical REQ、次 packet が以前を置換。
- backward: packet ごとの REQ を並行し、全対象 relay の EOSE/CLOSED/timeout 後に segment 完了。`over()` 後は全 segment 完了で Observable complete。
- dynamic session/segment RxRelays の既存 semantics を real adapter で検証する。
- filter matching、verification、expiration check を Task 01 で決めた順序へ接続する。
- D12 で NIP-11 `max_subscriptions` を初期 v4 に含めるなら queue を physical planner 内に置く。含めない場合は behavior matrix で明示的に deferred とする。

## error/finalization policy

- relay-local drop/retry exhaustion はその relay segment を終端し、他 relay を継続する（D5 推奨案）。
- malformed EVENT、verifier exception、filter evaluator exception の扱いを混同しない。
- backward timeout を RxJS の未処理 error にせず、該当 relay の正常な query termination または typed state として扱う契約を固定する。
- empty destination は warning だけか即 complete かを strategy ごとに contract 化する。

## 受入条件

- public `req()` を使う `*.spec.ts` が forward/backward の wire messages と results を検証する。
- public query result から `subId`/`vreqId` を参照できず、同じ `traceTag` が relay や将来の physical split をまたぐ logical correlation value になる。
- unsubscribe で正しい subId の CLOSE が送られる。
- reconnect 後の REQ で lazy `since`/`until` が再評価される。
- dynamic relay 追加時、未完了 query だけが新 relay へ送られる。
- filter mismatch、invalid signature、expired EVENT が option に従い drop される。
- query count/timer/listener が全終了経路で 0 に戻る。

## 非目標

- D9 で deferred とした automatic splitting/multiplexing
- COUNT query など REQ 以外の新規 high-level API
