# 現状監査

## 要約

v4 の core implementation と Task 10 の source/workspace/dependency/release-tooling 整理まで完成しています。v4 implementation は正式な `src` にあり、v3 test契約の全件監査、pnpm workspace、minimum release age、TypeScript 7、`nostr-typedef` peer dependency、Changesetsへの移行が完了しました。残る作業は、Task 11 の linter/formatter再設計と、Task 12 の package artifact、runtime matrix、migration/release documentationの最終監査です。

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
| package/build                         | 基盤移行済み   | `src`、pnpm、TypeScript 7、peer dependency、Changesetsへ移行済み。Task 11で静的品質ゲート、Task 12で配布 artifactを最終監査する。          |

## 現在確認できる品質ゲート

2026-09-22 の Task 10 完了時に次を実行しました。

- `pnpm --filter rx-nostr typecheck`: 成功
- `pnpm --filter rx-nostr test:unit`: 17 files / 95 tests が成功
- `pnpm --filter rx-nostr test:contract`: 7 files / 45 tests が成功
- `pnpm test`: workspace全体で成功（rx-nostr 140、unipls 124、crypto 3、crypto-wasm 3 tests）
- `pnpm build`: workspace全体で成功
- `pnpm install --frozen-lockfile --ignore-scripts`: 成功
- `pnpm changeset:status`: 成功
- packed rx-nostrの一時consumerでTypeScript 7 typecheckとNode importが成功

Task 00 で記録した38 diagnosticsはTasks 01–08ですべて解消済みです。lint/format gateはTypeScript 7対応toolを選定するTask 11へ明示的に移し、package artifactとruntime matrixの完全なrelease gateはTask 12で実施します。

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

Task 10で`package-lock.json`を`pnpm-lock.yaml`へ移行しました。利用者指定により`crypto-wasm`の依存version更新は対象外とし、unipls submoduleも変更していません。今後uniplsの変更が必要になった場合は、従来どおり着手前に根拠と代替案を利用者へ提示します。
