# 12 — F12: Worker verifier の timeout を正しい deadline にする

優先度: **P2**。対応元: **F12**。状態: **未着手**。

## 目的と背景

Batch は callback を takeNext に入れ、1 interval 後に fireNext へ移し、さらに次で実行する。timeout:100 の生成直後の request が100msで pending、200msでrejectとなった。deadline は request の開始時点からの待ち時間であるべきで、interval の位相に依存すべきでない。

## 主な対象

- [packages/rx-nostr/src/event-verifier/worker-verifier.ts](../packages/rx-nostr/src/event-verifier/worker-verifier.ts)
- [packages/docs/ja/v4/signer-verifier.md](../packages/docs/ja/v4/signer-verifier.md)

新規テストは対象機能の既存spec/unit fileに追加し、適切な既存fileがなければ同じ層に作成する。

## 実装内容

1. request ごとの timer または実 deadline を持つ共有 timer に置き換える。wall clock の実行遅延と設計上の余分な interval を区別する。
2. 成功・失敗・dispose で関連 timer を確実に解除する。常駐 interval が不要ならなくす。
3. 0/Infinity/負数/NaN/上限超過の扱いを明記し、21の数値契約と後から揃えられる構造にする。
4. 11の pending registry を再利用し、独立した第二の settlement 管理を作らない。

## 受入条件

- timeout:100 の request は fake time 99ms で pending、100msで timeout する。
- 生成直後/任意の遅延後に開始しても相対 deadline が同じ。
- 複数 request の deadline が互いに影響しない。
- 応答済み・dispose 済み request の timer が残らない。
- 同時刻の応答と timeout は一度だけ完了する。

## 検証シナリオ

fake timers で厳密な境界を検査する。実時間で100ms以内といった flaky な検査は作らない。timers の内部配列構造ではなく Promise の観測結果と cleanup を assert する。

最低限の検証コマンド（新しい検査scriptを追加した場合はその実行も含める）:

```sh
pnpm --filter rx-nostr test:unit
pnpm --filter rx-nostr typecheck
```

変更したファイルのformatter/lintも実行する。広範囲の変更ではrootの `pnpm test` / `pnpm build` で全体回帰を確認する。

## 依存関係と担当境界

先行タスク: [11: F11: Worker verifier の pending request を終了する](11-settle-worker-on-dispose.md)

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
