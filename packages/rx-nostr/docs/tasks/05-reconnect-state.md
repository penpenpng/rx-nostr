# Task 05: Reconnect と connection state

Status: **complete (2026-09-21)**

## 目的

unipls の lifecycle/reconnector を唯一の transport state source とし、rx-nostr 利用者に Nostr application 向けの安定した state/diagnostic を提供する。

## 作業

- D4 に従う reconnector factory config と D11 の default policy を実装する。
- D5a に従い initial open failure、ready、drop、retry wait、retry attempt、terminal failure、idle close、dispose を rx-nostr 独自 state へ写像する。
- `monitorConnectionState()` を replay semantics が明確な Observable として実装する。
- pool にまだ entry がない relay を監視対象にするか、作成済み entry のみかを public docs へ明記する。
- unipls diagnostic/drop metadata から公開する情報と隠す transport detail を分ける。
- RelayDirectory reporter を lifecycle events へ接続する。
- manual recovery が必要なら directory ではなく RxNostr/pool の明示 API として設計する。
- active REQ/publish operation の retry preset/custom recovery を Task 06/08 が利用できる internal policy にまとめる。

## state mapping の要件

- connection demand がない状態と、unexpected terminal failure を区別する。
- reconnect policy の待機中と実接続試行中を区別できる。
- reason は opaque mutable object をそのまま長期保持せず、必要な drop metadata を snapshot 化する。
- state emission は重複を抑え、同一 relay の時系列順を保つ。

## 受入条件

- controlled transport で state transition table 全 edge を検証する。
- peer close code 1000 も open intent 中なら drop として unipls policy に従う。
- one relay の retry exhaustion が他 relay の state/operation を終了しない。
- idle/hot/query lease による user close は automatic reconnect を開始しない。
- dispose 後に retry timer/action が発火しても socket を再作成しない。
- directory の last success/failure と公開 state の event source が矛盾しない。

## 非目標

- RxJS で別の reconnect engine を再実装すること
- relay score による policy 自動選択

## 実装結果

- unipls lifecycle snapshot を唯一の transport state source とし、rx-nostr の immutable `ConnectionState` へ写像した。初回接続と retry attempt を分け、policy が確定した正確な delay を `waiting-for-retry` に保持する。
- `monitorConnectionState()` は pool に存在する relay と subscription 後に作られた relay を統合する。監視だけでは pool entry/connection を作らず、relay ごとの最新 state は replay される。
- 同一 state の重複 emission を抑え、idle/user close は `dormant`、retry terminal は typed failure を持つ `failed`、instance cleanup は `disposed` として区別した。
- retryer は引き続き rx-nostr 独自 I/F とし、unipls reconnector への adapter 内で wait/cancel/exhaust と AbortSignal を扱う。pending timer は close/dispose で中断される。
- RelayDirectory reporter を同じ lifecycle transition に接続した。ready connection ごとの冪等 close handle と、drop/attempt failure report により live count と failure counter を公開 state と同期し、更新後の共有 health snapshot を retryer context に渡す。
- controlled transport で初回失敗、ready、peer close code 1000、retry wait/attempt、exhaustion、idle close、dispose 中断、複数 relay の failure isolation を検証した。

Task 06/08 が利用する operation recovery は、Nostr transport の `resend`/`fail` policy seam を維持している。NIP-42 を含む具体的な resend 条件は各後続 task が実装する。
