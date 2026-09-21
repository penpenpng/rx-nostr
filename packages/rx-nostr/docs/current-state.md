# 現状監査

## 要約

v4 は、relay 集合の動的制御と forward/backward REQ の上位ロジックまで実装が進んでいます。一方、実通信、公開 `RxNostr`、publish、relay directory、connection state/retry はスケッチ段階です。現在通るテストは通信層を mock に置き換えた 19 件で、実 WebSocket/通信断を含む公開契約はまだ固定されていません。

## モジュール別状況

| 領域                                  | 状況             | 根拠・注意点                                                                                                                     |
| ------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `rx-req`                              | 概ね維持         | forward/backward、pipe、one-shot が存在する。公開契約テストは不足。`traceId`/`traceTag` の型不整合がある。                       |
| `rx-relays`                           | 概ね維持         | 動的集合と union/intersection/difference がある。dispose と派生集合の所有権は TODO。                                             |
| signer/verifier/lazy-filter/operators | 概ね維持         | v4 向けに分離済み。統合テストと public export 監査は未実施。                                                                     |
| forward/backward REQ                  | 上位ロジックあり | mock 通信層を用いた動的 relay、segment relay、weak/defer/linger のテストがある。                                                 |
| query session / hot relays            | 部分実装         | ref-count 相当の `Latch` はある。`RelayWarmer` は存在しない `connect()`/`release()` を呼んでおり未統合。                         |
| relay communication                   | 未実装           | `NostrWebsocket` が未定義、backward と publish は空、直接 WebSocket 案の残骸がある。                                             |
| publish                               | 未実装           | `summarize()` が存在せず、timeout packet の型も不一致。                                                                          |
| authenticator                         | 部品のみ         | AUTH event を署名する部品はあるが、challenge 監視、再送、timeout が通信層へ接続されていない。                                    |
| relay directory                       | スケッチ         | serialize/deserialize/retry/state 集計が未実装。`_getOrCreate()` は既存値を確認せず毎回上書きする。                              |
| connection state/retry                | 仮 I/F           | 独自 state と `Observable<void>` retryer は unipls の lifecycle/reconnector と責務が重複する。                                   |
| `RxNostr` 公開 API                    | 未完成           | `monitorConnectionState()` は空。実装クラスではなく `rx-nostr.legacy.ts` の宣言だけが `createRxNostr` として export されている。 |
| WebSocket 抽象化                      | 未移行           | `next/websocket.ts` と `next/rx-nostr/websocket.ts` が直接 WebSocket を扱う未完成コードとして残る。v4 では削除対象。             |
| package/build                         | 未移行           | package version/dependencies は v3 のままで unipls 依存がない。型生成時に多数の診断が出るが build process は exit 0 になる。     |

## 現在確認できる品質ゲート

2026-09-21 に次を実行しました。

- `npm test -w packages/rx-nostr -- --run`: 5 files / 19 tests が成功
- `npm run lint -w packages/rx-nostr`: 成功
- `npm run build -w packages/rx-nostr`: process は exit 0 だが declaration generation が多数の TypeScript error を報告

したがって「build 成功」は現時点では品質ゲートになりません。型検査を独立コマンドにし、診断がある場合は非 0 で終了させる必要があります。

主な診断は次のとおりです。

- 未完成の relay communication、publish、monitoring、relay directory
- `RelayWarmer` と `RelayCommunication` の I/F 不一致
- packet helper の `subId` 欠落、`traceId`/`traceTag` 不一致
- `tsconfig.json` が欠落した v3 `src` と v4 `next` の両方を対象にしている
- `rx-nostr.legacy.ts` の解決不能な型

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

調査時点で `.gitmodules` と `packages/unipls` は staged、`.nvmrc`、`package-lock.json`、`.npmrc` に利用者の未コミット変更があります。これらを v4 実装の都合で上書き・巻き戻ししてはいけません。依存関係を整えるタスクでは、まずその変更意図と現在の submodule 方針を再確認します。
