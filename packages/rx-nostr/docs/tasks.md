# v4 implementation tasks

## 進め方

タスクは番号順が基本です。並行可能と明記したもの以外は、先行タスクの受入条件を満たしてから開始します。詳細は各リンク先にあります。

| ID  | Task                                                                                  | Depends on | Decision gate                 | Status   |
| --- | ------------------------------------------------------------------------------------- | ---------- | ----------------------------- | -------- |
| 00  | [Baseline と contract matrix](./tasks/00-baseline-contracts.md)                       | -          | D8                            | complete |
| 01  | [Public model と config の固定](./tasks/01-public-model.md)                           | 00         | D1, D5, D6, D9, D10, D13, D14 | complete |
| 02  | [unipls transport adapter](./tasks/02-unipls-adapter.md)                              | 00, 01     | D4, D11                       | complete |
| 03  | [RelayCommunicationCollection、lease、hot relays](./tasks/03-relay-collection-hot.md) | 02         | D9, D14                       | complete |
| 04  | [RelayDirectory](./tasks/04-relay-directory.md)                                       | 01         | D2, D3, D12                   | complete |
| 05  | [Reconnect と connection state](./tasks/05-reconnect-state.md)                        | 02, 04     | D2, D4, D5, D11               | complete |
| 06  | [REQ protocol と query engine](./tasks/06-query-engine.md)                            | 03, 05     | D5, D9, D12, D13, D14         | complete |
| 07  | [NIP-42 AUTH](./tasks/07-auth.md)                                                     | 06         | D7                            | complete |
| 08  | [Publish pipeline](./tasks/08-publish.md)                                             | 03, 05, 07 | D5, D6, D10, D11, D14         | complete |
| 09  | [RxNostr facade と lifecycle](./tasks/09-rx-nostr-facade.md)                          | 06, 08     | D1                            | complete |
| 10  | [Source、workspace、依存関係、release 管理の整理](./tasks/10-code-quality.md)         | 09         | -                             | complete |
| 11  | [Linter、formatter、静的品質ゲートの再設計](./tasks/11-lint-format.md)                | 10         | -                             | complete |
| 12  | [Package、contract test、release readiness](./tasks/12-package-release.md)            | 11         | D8                            | ready    |

## Milestones

### M1: 型の通る伝送基盤

Tasks 00–03。unipls 上で relay connection を lease 管理でき、hot/weak/defer/linger を controlled transport で検証できる状態。

### M2: 回復可能な REQ

Tasks 04–07。directory/state/reconnect と forward/backward REQ、CLOSE、AUTH が public contract test を通る状態。

### M3: 公開 API 完成

Tasks 08–09。publish と RxNostr facade、dispose、複数 relay の failure isolation が完成した状態。

### M4: 配布基盤の整理

Task 10。v4 source を正式な `src` へ移し、v3 test 契約を全件監査したうえで、pnpm workspace、依存関係、peer dependency、Changesets を整える状態。

### M5: 静的品質ゲートの完成

Task 11。TypeScript 6、pnpm workspace、Vite+ に適合する build、linter、formatter、CI gate を完成させる状態。

### M6: 配布可能

Task 12。型・artifact・runtime・migration docs を含む release gate が、成功と失敗を正しい exit code で表す状態。

## 全タスク共通の Definition of Done

- 公開契約の追加・変更は `*.spec.ts`、内部アルゴリズムは `*.test.ts` で検証される。
- direct WebSocket access を production v4 code に追加していない。
- error、unsubscribe、timeout、drop、dispose の cleanup path を検証している。
- typecheck と対象 test が成功する。Task 11 完了後は lint と format check も共通 gate に含める。
- public export を変更した場合は API fixture と docs を同じタスクで更新する。
- 実装がこの計画と異なる場合は、コードだけでなく関連 task/decision/architecture 文書も更新する。
- unipls の不足が見つかった場合は変更せず、再現 test と必要な capability をまとめて利用者へ相談する。
