# 現状監査

## 要約

v4 は、relay 集合の動的制御、forward/backward REQ の上位ロジック、公開 model/config の固定まで進んでいます。一方、実通信、`RxNostr` facade、publish、relay directory、connection state/retry の実装はスケッチ段階です。Task 01 完了時点では 25 unit tests と 4 public contract tests が通りますが、実 WebSocket/通信断の contract はまだありません。

## モジュール別状況

| 領域                                  | 状況             | 根拠・注意点                                                                                                                 |
| ------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `rx-req`                              | 契約固定         | forward/backward、pipe、one-shot を維持し、one-shot の backward semantics と `traceTag` を検証済み。                         |
| `rx-relays`                           | 概ね維持         | 動的集合と union/intersection/difference がある。dispose と派生集合の所有権は TODO。                                         |
| signer/verifier/lazy-filter/operators | 概ね維持         | v4 向けに分離済み。Task 01 で public export を監査し、明確な型欠陥だけを修正した。                                           |
| forward/backward REQ                  | 上位ロジックあり | mock 通信層を用いた動的 relay、segment relay、weak/defer/linger のテストがある。                                             |
| query session / hot relays            | 部分実装         | ref-count 相当の `Latch` はある。`RelayWarmer` は存在しない `connect()`/`release()` を呼んでおり未統合。                     |
| relay communication                   | 未実装           | `NostrWebsocket` が未定義、backward と publish は空、直接 WebSocket 案の残骸がある。                                         |
| publish                               | 未実装           | `summarize()` が存在せず、timeout packet の型も不一致。                                                                      |
| authenticator                         | 部品のみ         | AUTH event を署名する部品はあるが、challenge 監視、再送、timeout が通信層へ接続されていない。                                |
| relay directory                       | スケッチ         | serialize/deserialize/retry/state 集計が未実装。`_getOrCreate()` は既存値を確認せず毎回上書きする。                          |
| connection state/retry                | 公開 model 固定  | rx-nostr 独自 state snapshot と retry decision I/F は固定済み。unipls lifecycle への接続は未実装。                           |
| `RxNostr` 公開 API                    | model 固定       | v3 placeholder は削除済み。`createRxNostr`/`IRxNostr` は v4 model を公開するが、publish と state monitoring の実装は未完成。 |
| WebSocket 抽象化                      | 未移行           | root の古い structural file は削除済み。`next/rx-nostr/websocket.ts` の direct WebSocket code は Task 02 の削除対象。        |
| package/build                         | gate 整備済み    | v4 typecheck と declaration diagnostics は非 0 を返す。package version/dependencies と unipls package 解決はまだ v3 のまま。 |

## 現在確認できる品質ゲート

2026-09-21 に次を実行しました。

- `npm test -w packages/rx-nostr`: 7 files / 29 tests が成功
- `npm run lint -w packages/rx-nostr`: 成功
- `npm run typecheck -w packages/rx-nostr`: 34 件の後続 task 所有 error を報告して exit 2
- `npm run build -w packages/rx-nostr`: typecheck gate で exit 2

build/typecheck は未実装を成功扱いにしない品質ゲートになりました。全体成功は後続 task の diagnostics 解消後です。

主な診断は次のとおりです。

- 未完成の relay communication、publish、monitoring、relay directory
- `RelayWarmer` と `RelayCommunication` の I/F 不一致
- direct WebSocket code と未完成 transport adapter
- publish implementation と facade の `Publication` 不一致
- connection state monitor、relay warmer、relay directory の placeholder

## v3 から保持すべき問題領域

v3 の完全な `main` と利用者ドキュメントから、少なくとも次の契約を v4 で明示的に採用・変更・廃止のいずれかへ分類する必要があります。

- 複数 relay への REQ/publish と、relay 単位の失敗分離
- forward は最新 REQ が以前の REQ を置換し、backward は EOSE まで並行すること
- Rx unsubscribe 時の Nostr `CLOSE`
- 再接続時の REQ 再発行と lazy filter の再評価
- 未確認 EVENT の再送方針
- NIP-42 AUTH 後の REQ/EVENT 再送
- NIP-11 `max_subscriptions` を使うキューイング
- event verification、filter matching、NIP-40 expiration filtering
- connection state の観測と手動回復
- dispose 後に socket、subscription、timer、listener を残さないこと

v4 は破壊的変更を許容するため v3 の API 形状そのものは維持しませんが、黙って機能を失わないよう上記を contract matrix へ記録します。

## unipls の利用可能な能力

現在の unipls は、rx-nostr が必要とする伝送路の基礎を既に提供しています。

- serializer/deserializer 付きの typed WebSocket client
- `open()` / `close()` と immutable lifecycle snapshot
- `cast`、`request`、`listen`、`subscribe`
- AbortSignal、timeout、stream finalization
- reconnect policy と operation の `fail` / `wait` / `resend` / custom recovery
- logical session と transport epoch の分離
- drop、diagnostic、resource cleanup、stale event isolation
- WebSocket constructor 注入と controlled WebSocket を使った contract tests

注意点として、unipls の stream handle の `unsubscribe()` は remote protocol の解除メッセージを送りません。Nostr `CLOSE` の生成と送信は rx-nostr の protocol adapter が担当します。これは責務分割として自然であり、現時点では unipls 変更を必要としません。

## 作業ツリー上の注意

計画作成時に `.gitmodules`、`packages/unipls`、`.nvmrc`、`package-lock.json`、`.npmrc` の変更が baseline commit に取り込まれています。特に unipls と lockfile は rx-nostr 実装の都合で無断変更せず、依存関係を整える際は現在の submodule 方針を再確認します。
