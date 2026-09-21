# 現状監査

## 要約

v4 は、relay 集合の動的制御、forward/backward REQ の上位ロジック、公開 model/config、unipls transport adapter、per-instance pool と connection lease、共有 RelayDirectory、connection state/retry 集約まで完成しています。一方、REQ protocol の完成、`RxNostr` facade、publish は未実装部分が残っています。Task 05 完了時点では 83 unit tests と 13 public contract tests が通り、controlled transport で通信断、再接続、retry cancellation、hot/query lease の競合と metadata/health 集約を検証しています。

## モジュール別状況

| 領域                                  | 状況               | 根拠・注意点                                                                                                                            |
| ------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `rx-req`                              | 契約固定           | forward/backward、pipe、one-shot を維持し、one-shot の backward semantics と `traceTag` を検証済み。                                    |
| `rx-relays`                           | 概ね維持           | 動的集合と union/intersection/difference がある。dispose と派生集合の所有権は TODO。                                                    |
| signer/verifier/lazy-filter/operators | 概ね維持           | v4 向けに分離済み。Task 01 で public export を監査し、明確な型欠陥だけを修正した。                                                      |
| forward/backward REQ                  | 上位ロジックあり   | mock 通信層を用いた動的 relay、segment relay、weak/defer/linger のテストがある。                                                        |
| query session / hot relays            | 実装済み           | query/publish/hot が同じ idempotent lease を使用し、prewarm、weak、linger、rapid reacquire、dispose を検証済み。                        |
| relay pool                            | 実装済み           | instance ごと・normalized URL ごとに一 entry。初期 v4 は idle eviction せず instance dispose で一括解放する。                           |
| relay communication                   | transport 移行済み | unipls adapter 上で REQ/EVENT の最小 wire 動作と unsubscribe 時の CLOSE 順序を実装済み。完全な query/publish semantics は Tasks 06/08。 |
| publish                               | 未実装             | `summarize()` が存在せず、timeout packet の型も不一致。                                                                                 |
| authenticator                         | 部品のみ           | AUTH event を署名する部品はあるが、challenge 監視、再送、timeout が通信層へ接続されていない。                                           |
| relay directory                       | 実装済み           | global/injected directory、immutable entry、NIP-11 dedupe/cache、health reporter、versioned merge snapshot と lifecycle 配線を実装済み。 |
| connection state/retry                | 実装済み           | unipls lifecycle を rx-nostr state へ写像し、replay/重複抑制、retry wait/attempt、terminal/idle/dispose、directory health 配線を実装済み。 |
| `RxNostr` 公開 API                    | 一部実装済み       | v3 placeholder は削除済み。`monitorConnectionState()` は実装済みだが、REQ/publish と facade lifecycle の完成は Tasks 06/08/09。         |
| WebSocket 抽象化                      | 移行済み           | production の direct WebSocket 利用を削除し、constructor を含む伝送路操作は internal unipls adapter に限定した。                        |
| package/build                         | gate 整備済み      | runtime dependency は manifest に宣言済み。lockfile 同期と配布 artifact 検証は Task 10。                                                |

## 現在確認できる品質ゲート

2026-09-21 に次を実行しました。

- `npm run test:unit -w packages/rx-nostr`: 16 files / 83 tests が成功
- `npm run test:contract -w packages/rx-nostr`: 3 files / 13 tests が成功
- `npm run lint -w packages/rx-nostr`: 成功
- `npm run typecheck -w packages/rx-nostr`: 3 件の Task 08 所有 error を報告して exit 2
- `npm run build -w packages/rx-nostr`: typecheck gate で exit 2

build/typecheck は未実装を成功扱いにしない品質ゲートになりました。全体成功は後続 task の diagnostics 解消後です。

主な診断は次のとおりです。

- publish implementation と facade の `Publication` 不一致

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
