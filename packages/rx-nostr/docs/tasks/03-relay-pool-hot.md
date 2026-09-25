# Task 03: RelayPool、lease、hot relays

Status: **complete (2026-09-21)**

## 目的

宛先集合と connection lifetime を分離し、query/publish/hot relay が同じ lease mechanism を共有する。

## 作業

- normalized URL ごとに `RelayCommunication` を一つ作る per-instance pool を実装する。
- `hold()` が idempotent disposer を返す lease contract を固定する。
- 0 -> 1 lease で unipls session を開き、1 -> 0 で linger 後に閉じる。open/close race を test clock で検証する。
- `ConnectionDemandScope` の prewarm、relay demand window、linger、weak を lease に接続する。
- `RelayWarmer` を `hold()` ベースに修正し、動的 `RxRelays` 差分ごとに hot lease を取得/解放する。
- hot set の置換、同一 URL alias、empty set、dispose を検証する。
- pool entry の eviction policy を決める。少なくとも active lease/query がある entry は削除しない。

## 必須 scenario

- hot かつ query target: 二重 lease でも query 終了後に connection を維持
- hot から除外したが active query 中: query 終了まで維持
- query target だが hot でない: linger 後に close
- weak query + disconnected: connection を作らず結果なし
- weak query + hot/open: 既存 connection を利用
- dynamic RxRelays: 追加は relay demand window を開き、削除は該当 window だけ閉じる
- rapid remove/re-add: 不要な socket blink と stale close を起こさない

## 受入条件

- hot relay の指定だけでは REQ/EVENT を送らない。
- relay destination の指定だけでは connection を永続 hot にしない。
- lease disposer を複数回呼んでも count が負にならない。
- RxNostr dispose 後に遅延 linger callback が connection を再操作しない。
- 現在の forward/backward mock tests が同じ上位 semantics で通る。

## 非目標

- global connection sharing
- 一 URL の multiple physical connections
- reconnect policy の詳細（Task 05）

## 実装結果

- per-instance `RelayPool` が URL を再正規化し、一つの normalized URL に一つの `RelayCommunication` を割り当てる。
- 初期 v4 では pool entry を idle eviction しない。entry は RxNostr instance の dispose まで保持し、pool dispose で全 entry を一度だけ破棄する。
- `ConnectionLeaseController` が idempotent lease disposer と 0→1 open / 1→0 close を管理する。最後の release による close は microtask まで保留し、同一 turn の再取得で stale close を無効化する。
- query の `linger` は `ConnectionDemandScope` が lease の release を遅延させる。scope dispose は timer を取り消して即時 release し、pool/communication dispose 後の callback は transport を再操作しない。
- `RelayWarmer` は hot relay ごとの lease disposer を直接所有し、dynamic `RxRelays` の追加・削除・集合置換に追従する。hot 専用 connection API は持たない。
- hot/query の二重 lease、active query 中の hot removal、linger、weak、URL alias、empty set、rapid reacquire、dispose を unit test で検証した。
