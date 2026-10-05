# 26 — テスト拡充: publication の observer と再入

優先度: **P2**。対応元: **publicationテスト**。状態: **未着手**。

## 目的と背景

publicationはhotで、OK streamはreplayされる。waitFor all/any、cancel、署名結果、lingerは異なる寿命を持つ。F02のobserver mutationとF05の署名/送信混同を修正した後、同期callbackからの再入や複数publicationの相互作用まで外部契約として検査する。

## 主な対象

- [packages/rx-nostr/src/**test**/specs/publish.spec.ts](../packages/rx-nostr/src/__test__/specs/publish.spec.ts)
- [packages/rx-nostr/src/**test**/helper/publication-scenario.ts](../packages/rx-nostr/src/__test__/helper/publication-scenario.ts)
- [packages/rx-nostr/src/**test**/helper/protocol-scenario.ts](../packages/rx-nostr/src/__test__/helper/protocol-scenario.ts)
- [packages/rx-nostr/src/publication/publication.interface.ts](../packages/rx-nostr/src/publication/publication.interface.ts)

新規テストは対象機能の既存spec/unit fileに追加し、適切な既存fileがなければ同じ層に作成する。

## 実装内容

1. observerのcancel/root dispose/別publication開始/waitFor登録が同期的に起きる場合を個別シナリオにする。
2. 複数observer、late replay、同じEVENT IDの同relay/別relay publicationを検査する。
3. AUTH requiredの一時的OKと最終OK、timeoutとOK競合、cancel後の遅い署名/応答を検査する。
4. allが失敗してもanyの可能性が残る場合、any成功後も残りの送信が続く場合を保証する。
5. 不具合を見つけた場合は期待値を現状へ合わせず、個別の最小修正と回帰を加える。

## 受入条件

- observerがprotocolの成否や他observerの値を変えない。
- terminal後に新たな送信/二重settlementが起きない。
- observer unsubscribeだけでは送信を取り消さない。
- weak/linger/shared demandを壊さず、終了後のtimerとleaseが解放される。

## 検証シナリオ

scenarioTestと制御socketを使い、各testは一つの原因/最終結果を持つ。fake time境界の直前/直後でassertし、すべてのPromise rejectionを観測する。

最低限の検証コマンド（新しい検査scriptを追加した場合はその実行も含める）:

```sh
pnpm --filter rx-nostr test:contract src/__test__/specs/publish.spec.ts src/__test__/specs/connection-demand.spec.ts
pnpm --filter rx-nostr typecheck
```

変更したファイルのformatter/lintも実行する。広範囲の変更ではrootの `pnpm test` / `pnpm build` で全体回帰を確認する。

## 依存関係と担当境界

先行タスク: [02: F02: OK 通知を内部の成功判定から分離する](02-isolate-publication-ok.md)、[05: F05: legacy cast の完了を実際の送信と結び付ける](05-wait-for-legacy-send.md)、[17: 内部設計: 公開値と内部状態の所有権を統一する](17-standardize-public-value-ownership.md)、[18: 内部設計: 操作の完了とリソース解放の責務を整理する](18-clarify-operation-lifecycle.md)

先行タスクの仕様と回帰テストは維持する。後続テストタスクがあっても、本タスクの修正に必要な最小回帰テストを先送りしない。根拠の詳細は [監査レポート](../report.md) でも確認できるが、本ファイルの実施内容・受入条件を基準に進められる。

## 作業上の前提

このファイル単独で着手できるよう、監査の原因・期待動作・対象を記載している。基準は2026-10-05のコミット `e4625d47584fffcc8e2343b83cd01dbd5ccefc15`。着手時は現行コードと先行タスクの変更を確認する。一時的な `/tmp` の監査ファイルへの依存は禁止する。パスは特記しない限りリポジトリルート基準。

- pnpm workspace。実行はルートから行う。Node24.13.1で監査済み。rx-nostrはVitest5のcontract/unit project、cryptoはVitest5、WASMはVitest3を使用する。
- 本体はrelay-firstの `forward/backward/publish`。queryはcold、publishはhot。sourceのdispose、購読解除、rootのdisposeは同義ではない。
- テスト規約は `packages/rx-nostr/src/__test__/README.md`。controlled socket、deferred promise、fake timerを使い、実リレーや任意のsleepに依存しない。close acknowledgementとtimer復元まで片付ける。
- 不具合の再現テストは「現状の誤動作」ではなく修正後の契約を期待し、修正前に失敗することを確認する。既存テストを緩めて通さない。
- 公開契約を変更した場合は `.changeset` に対象packageの説明を追加する。docs/testだけなら不要。必要なJSDoc/docsも同じ変更で更新する。
- ユーザーはF15（空の英語v4 docs）を許容済み。他の残件をF15へまとめて先送りしない。英語翻訳や空ページ対策を受入条件にしない。
- ユーザーは順次の実装・検証・タスクごとのcommitを依頼している。検証後、このファイルへ結果、採用した仕様、実行コマンド、残件を追記し、そのタスクの変更をcommitする。互換性やサポート範囲でユーザー判断が必要なら具体的に質問する。

## 完了記録

未着手。完了時に実装内容、テスト結果、判断事項を追記する。
