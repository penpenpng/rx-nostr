# 08 — F08: filter の 0 の時刻境界を保持する

優先度: **P2**。対応元: **F08**。状態: **未着手**。

## 目的と背景

evalFilters([{until:0}]) は until を undefined にし、isFiltered(event,{until:0}) は created_at:1 でも true を返す。両方とも truthiness で境界の有無を判定する。until:()=>0 は送信値が残っても matching で無視される。since:0 と exclusive option にも同じ種類の問題がある。

## 主な対象

- [packages/rx-nostr/src/lazy-filter/lazy-filter.ts](../packages/rx-nostr/src/lazy-filter/lazy-filter.ts)
- [packages/rx-nostr/src/libs/nostr/filter.ts](../packages/rx-nostr/src/libs/nostr/filter.ts)
- [packages/rx-nostr/src/rx-nostr/communication/executor/nostr-operation-executor.ts](../packages/rx-nostr/src/rx-nostr/communication/executor/nostr-operation-executor.ts)
- [packages/rx-nostr/src/**test**/specs/query.spec.ts](../packages/rx-nostr/src/__test__/specs/query.spec.ts)

新規テストは対象機能の既存spec/unit fileに追加し、適切な既存fileがなければ同じ層に作成する。

## 実装内容

1. 時刻の省略と 0 を区別して評価・matching する。
2. lazy function は送信直前と再送時に評価する既存契約を守り、構築時評価へ移さない。
3. callback 例外は RxNostrCallbackError("filter") とする既存契約を維持する。
4. static / emitted filter の広い統一は09に任せ、0 の最小修正と回帰は本タスクで完結する。

## 受入条件

- until:0 は wire 上に残り、created_at:1 を拒否、created_at:0 を inclusive 条件で受理する。
- since:0 の inclusive/exclusive が明示された期待値と一致する。
- numeric / lazy の結果が一致する。
- lazy 再送時の再評価と例外処理が維持される。

## 検証シナリオ

単体で evalFilters / matching、contract で実際の REQ tuple と EVENT の通過を検査する。比較関数の境界検査では created_at -1/0/1 を使ってもよいが、負の timestamp を wire の正規 EVENT として許容する判断とは切り離す。

最低限の検証コマンド（新しい検査scriptを追加した場合はその実行も含める）:

```sh
pnpm --filter rx-nostr test:unit
pnpm --filter rx-nostr test:contract src/__test__/specs/query.spec.ts
pnpm --filter rx-nostr typecheck
```

変更したファイルのformatter/lintも実行する。広範囲の変更ではrootの `pnpm test` / `pnpm build` で全体回帰を確認する。

## 依存関係と担当境界

先行タスク: なし。独立して着手可能。

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
