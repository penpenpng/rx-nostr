# 28 — テスト拡充: filter の境界と入力形式の同値性

優先度: **P2**。対応元: **filter/URLテスト**。状態: **未着手**。

## 目的と背景

query契約はfilter matching→verifier→expirationで、static配列とRxReqの両形式を受ける。空条件配列/0境界が未検査だった。lazy filterは再送直前に再評価され、NIP-11 queueから送信された時にbackward timeoutが始まる。入力意味とタイミングを両方検査する。

## 主な対象

- [packages/rx-nostr/src/**test**/specs/query.spec.ts](../packages/rx-nostr/src/__test__/specs/query.spec.ts)
- [packages/rx-nostr/src/rx-req/rx-req.test.ts](../packages/rx-nostr/src/rx-req/rx-req.test.ts)
- [packages/rx-nostr/src/lazy-filter/lazy-filter.ts](../packages/rx-nostr/src/lazy-filter/lazy-filter.ts)
- [packages/rx-nostr/src/libs/nostr/filter.ts](../packages/rx-nostr/src/libs/nostr/filter.ts)
- [packages/rx-nostr/src/libs/relay-urls.test.ts](../packages/rx-nostr/src/libs/relay-urls.test.ts)

新規テストは対象機能の既存spec/unit fileに追加し、適切な既存fileがなければ同じ層に作成する。

## 実装内容

1. 09で定義したinvalid/empty方針を共通入力表でstatic/emitted/pipedへ適用する。
2. 0、境界一致、since>until、lazyが0/例外/変化する値を返す場合、複数filter OR、limit:0を検査する。
3. queue待ち/再接続/AUTH再送中のlazy評価回数と時点を検査する。評価回数は仕様が要求する範囲に限定する。
4. filter不一致はverifierへ渡らない、例外とfalseが異なる、expiration skipが独立することを確認する。
5. URLのencoded query値とRxRelays/Directoryへの伝播も代表例を確認する。

## 受入条件

- 入力形式でwireや受理イベントが異ならない。
- 不正条件が全件検索に拡大しない。
- timeoutがqueue待ち中に誤開始しない。
- source終了・empty requestで不要なconnection demandを作らない。

## 検証シナリオ

matching単体は固定eventを使い、public queryはcontrolled socketで実REQを検査する。テスト名に残るdescriptor等の旧用語をstatic filterへ更新する。

最低限の検証コマンド（新しい検査scriptを追加した場合はその実行も含める）:

```sh
pnpm --filter rx-nostr test:unit
pnpm --filter rx-nostr test:contract src/__test__/specs/query.spec.ts
pnpm --filter rx-nostr typecheck
```

変更したファイルのformatter/lintも実行する。広範囲の変更ではrootの `pnpm test` / `pnpm build` で全体回帰を確認する。

## 依存関係と担当境界

先行タスク: [07: F07: relay URL の query 値を保持する](07-preserve-relay-query-values.md)、[08: F08: filter の 0 の時刻境界を保持する](08-preserve-zero-time-bounds.md)、[09: F09: static と emitted filter の意味を統一する](09-unify-query-filter-inputs.md)、[19: 内部設計: 入力正規化の境界を整理する](19-centralize-input-boundaries.md)、[21: API設計: timeout と linger の数値契約を揃える](21-validate-numeric-options.md)

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
