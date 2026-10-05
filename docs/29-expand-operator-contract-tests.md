# 29 — テスト拡充: operators と packet option の保持

優先度: **P2**。対応元: **operatorテスト**。状態: **未着手**。

## 目的と背景

operators.testはlatestEach/filterByType/dropExpiredEvents/tieの4ケースが中心。batchはrelayごとにまとめて先頭packetのoptionを残し、chunkは複数packetへ分割する。traceTag/lingerの衝突やlimit境界、状態を持つoperatorの共有を仕様として明確にする必要がある。

## 主な対象

- [packages/rx-nostr/src/operators/index.ts](../packages/rx-nostr/src/operators/index.ts)
- [packages/rx-nostr/src/operators/operators.test.ts](../packages/rx-nostr/src/operators/operators.test.ts)
- [packages/rx-nostr/src/operators/req-packet/batch.ts](../packages/rx-nostr/src/operators/req-packet/batch.ts)
- [packages/rx-nostr/src/operators/req-packet/chunk.ts](../packages/rx-nostr/src/operators/req-packet/chunk.ts)
- [packages/rx-nostr/src/operators/event-packet/create-tie.ts](../packages/rx-nostr/src/operators/event-packet/create-tie.ts)
- [packages/docs/ja/v4/operators.md](../packages/docs/ja/v4/operators.md)

新規テストは対象機能の既存spec/unit fileに追加し、適切な既存fileがなければ同じ層に作成する。

## 実装内容

1. exports一覧を基にoperatorごとの入力/出力/状態/完了/例外の検査表を作る。
2. latest/latestEach/timeline/sortEventsの同時刻、重複、limit:0/1、timer flushを検査する。
3. batchの同一/異なるrelay、RxRelays identity、空batch、merge function、traceTag/linger衝突を確認する。衝突方針をdocsに示す。
4. chunkのoption保持と空結果、predicate/split例外を検査する。
5. uniq/tieのoperator再利用、seenOnのsnapshot時点、filterAsyncの非同期完了順、unsubscribe/complete時の挙動を検査する。

## 受入条件

- docsにある動作とpacket optionの保持/集約規則がテストで確認される。
- 不正なlimit等の扱いが明記され、実装の偶然を期待値にしない。
- shared stateを意図するcreate系と購読ごとのstateの違いが説明される。
- timerを使うoperatorはfake timeで検査できる。

## 検証シナリオ

小さなpure input/output検査とRxJS TestScheduler/fake timerを使い分ける。すべてのoperatorへ無意味な同一形のテストを増やすのではなく、公開する境界と状態を検査する。

最低限の検証コマンド（新しい検査scriptを追加した場合はその実行も含める）:

```sh
pnpm --filter rx-nostr test:unit src/operators src/rx-req
pnpm --filter rx-nostr typecheck
```

変更したファイルのformatter/lintも実行する。広範囲の変更ではrootの `pnpm test` / `pnpm build` で全体回帰を確認する。

## 依存関係と担当境界

先行タスク: [10: F10: 同時刻 EVENT の ID 優先順を修正する](10-correct-event-tie-break.md)、[14: F14: 派生 RxReq の寿命を独立して管理する](14-dispose-derived-rxreq.md)

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
