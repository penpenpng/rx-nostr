# 10 — F10: 同時刻 EVENT の ID 優先順を修正する

優先度: **P2**。対応元: **F10**。状態: **未着手**。

## 目的と背景

compareEvents は同時刻の小さい ID を古い側へ置く。そのため latest/latestEach/laterEvent は大きい ID を選び timeline も大きい ID を先頭に置く。docs は NIP-01 順序をうたうが、同時刻 replaceable EVENT は小さい ID を保持すべきである。kind 0、同じ created_at、ID a...a と b...b で再現する。

## 主な対象

- [packages/rx-nostr/src/libs/nostr/event.ts](../packages/rx-nostr/src/libs/nostr/event.ts)
- [packages/rx-nostr/src/operators/event-packet/latest.ts](../packages/rx-nostr/src/operators/event-packet/latest.ts)
- [packages/rx-nostr/src/operators/event-packet/latest-each.ts](../packages/rx-nostr/src/operators/event-packet/latest-each.ts)
- [packages/rx-nostr/src/operators/event-packet/timeline.ts](../packages/rx-nostr/src/operators/event-packet/timeline.ts)
- [packages/rx-nostr/src/operators/event-packet/sort-events.ts](../packages/rx-nostr/src/operators/event-packet/sort-events.ts)
- [packages/rx-nostr/src/operators/operators.test.ts](../packages/rx-nostr/src/operators/operators.test.ts)
- [packages/docs/ja/v4/operators.md](../packages/docs/ja/v4/operators.md)

新規テストは対象機能の既存spec/unit fileに追加し、適切な既存fileがなければ同じ層に作成する。

## 実装内容

1. compareEvents の符号と「新しい」の契約を定義し、利用する全 utility/operator を追跡する。
2. 新しい timestamp を優先し、同時刻なら小さい ID を最新として扱う。
3. sortEvents の昇順/降順と timeline の新しい順を区別して docs に書く。
4. 同じ ID の比較は 0 とする既存意図を確認する。timestamp が不一致の同一 ID は不正イベントの検証問題と区別する。

## 受入条件

- latest/latestEach/laterEvent が同時刻の小さい ID を残す。
- timeline の先頭が同時刻の小さい ID になる。
- 両到着順、重複 ID、異なる key、異なる timestamp で一貫する。
- comparator の反対称性と推移性、sortEvents の既存の時刻方向を確認する。

## 検証シナリオ

期待値を compareEvents 自身から計算しない。固定 ID と timestamp に対する結果を明記する。NIP-01: https://github.com/nostr-protocol/nips/blob/master/01.md 。operator 全体の拡充は29で担当。

最低限の検証コマンド（新しい検査scriptを追加した場合はその実行も含める）:

```sh
pnpm --filter rx-nostr test:unit src/operators
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
