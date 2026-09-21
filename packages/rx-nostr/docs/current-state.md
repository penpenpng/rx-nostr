# 現状監査

## 要約

v4 の core implementation は、relay 集合、public config、unipls adapter、pool/lease/hot relays、RelayDirectory、connection state/retry、REQ query engine、NIP-42 AUTH、Publication、RxNostr facade lifecycle まで完成しています。残る作業は、Task 10 の source layout、v3 test 契約、pnpm workspace、依存関係、peer dependency、Changesets の整理と、Task 11 の package artifact、runtime matrix、migration/release documentation の最終監査です。Task 09 完了時点では 91 unit tests と 45 public contract tests が通り、controlled transport で通信断、再接続、REQ/CLOSE、publish all/any/cancel、lazy filter 再評価、relay-local timeout、NIP-11 query limit、AUTH、instance disposal、複数instance分離、設定優先順位を検証しています。

## モジュール別状況

| 領域                                  | 状況           | 根拠・注意点                                                                                                                               |
| ------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `rx-req`                              | 契約固定       | forward/backward、pipe、one-shot を維持し、one-shot の backward semantics と `traceTag` を検証済み。                                       |
| `rx-relays`                           | 概ね維持       | 動的集合と union/intersection/difference がある。dispose と派生集合の所有権は TODO。                                                       |
| signer/verifier/lazy-filter/operators | 概ね維持       | v4 向けに分離済み。Task 01 で public export を監査し、明確な型欠陥だけを修正した。                                                         |
| forward/backward REQ                  | 実装済み       | real adapter で REQ/CLOSE、forward replacement、backward terminal、動的 relay、weak/defer/linger、empty destination を検証済み。           |
| query session / hot relays            | 実装済み       | query/publish/hot が同じ idempotent lease を使用し、prewarm、weak、linger、rapid reacquire、dispose を検証済み。                           |
| relay pool                            | 実装済み       | instance ごと・normalized URL ごとに一 entry。初期 v4 は idle eviction せず instance dispose で一括解放する。                              |
| relay communication                   | query 実装済み | unipls adapter 上で resend、relay-local terminal、physical query queue、NIP-11 limit、filter snapshot、dispose cleanup を実装済み。        |
| publish                               | 実装済み       | hot Publication、raw OK replay、all/any、cancel、snapshot、AUTH/reconnect resend、relay-local failure isolation を検証済み。               |
| authenticator                         | 実装済み       | opt-in の relay coordinator が challenge 世代、dedupe、AUTH OK/timeout、REQ/EVENT一回再送、unsubscribe/dispose cleanup を管理する。        |
| relay directory                       | 実装済み       | global/injected directory、immutable entry、NIP-11 dedupe/cache、health reporter、versioned merge snapshot と lifecycle 配線を実装済み。   |
| connection state/retry                | 実装済み       | unipls lifecycle を rx-nostr state へ写像し、replay/重複抑制、retry wait/attempt、terminal/idle/dispose、directory health 配線を実装済み。 |
| `RxNostr` 公開 API                    | 実装済み       | `req()`、`publish()`、hot relays、state monitoring、disposed guard、operation-first cleanup、instance-local pool を検証済み。              |
| WebSocket 抽象化                      | 移行済み       | production の direct WebSocket 利用を削除し、constructor を含む伝送路操作は internal unipls adapter に限定した。                           |
| package/build                         | 基盤移行待ち   | Task 10 で `next` から `src`、npm から pnpm、依存関係と release 管理を整理し、Task 11 で配布 artifact を検証する。                         |

## 現在確認できる品質ゲート

2026-09-21 に次を実行しました。

- `npm run test:unit -w packages/rx-nostr`: 16 files / 91 tests が成功
- `npm run test:contract -w packages/rx-nostr`: 7 files / 45 tests が成功
- `npm run lint -w packages/rx-nostr`: 成功
- `npm run typecheck -w packages/rx-nostr`: 成功
- `npm run build -w packages/rx-nostr`: declaration generation を含め成功

Task 00 で記録した 38 diagnostics は Tasks 01–08 ですべて解消されました。Task 10 の基盤移行後、package artifact と runtime matrix の完全な release gate は Task 11 で実施します。

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

計画作成時に `.gitmodules`、`packages/unipls`、`.nvmrc`、`package-lock.json`、`.npmrc` の変更が baseline commit に取り込まれています。Task 10 では npm workspace と `package-lock.json` を pnpm workspace と lockfile へ移行しますが、unipls submodule の変更が必要になった場合は従来どおり着手前に根拠と代替案を利用者へ提示します。
