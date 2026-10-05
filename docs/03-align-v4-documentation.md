# 03 — F03: README と日本語 v4 docs を現行 API に揃える

優先度: **P1**。対応元: **F03**。状態: **未着手**。

## 目的と背景

現行 query API は forward(relays, request, options?) / backward(...)、request は RxReq または readonly LazyFilter[]。docs は req()、RxForwardReq / RxBackwardReq、strategy descriptor、over() を案内しており実行できない。root README と配布 README も異なる旧世代の API を使う。publish は hot Publication、query は cold Observable。F15（空の英語 v4）はユーザーが明示的に許容しており、翻訳・空ページ対策を本件へ持ち込まない。

## 主な対象

- [README.md](../README.md)
- [packages/rx-nostr/README.md](../packages/rx-nostr/README.md)
- [packages/docs/ja/v4](../packages/docs/ja/v4)
- [packages/rx-nostr/src/index.ts](../packages/rx-nostr/src/index.ts)
- [packages/rx-nostr/src/rx-nostr/rx-nostr.interface.ts](../packages/rx-nostr/src/rx-nostr/rx-nostr.interface.ts)
- [packages/rx-nostr/src/rx-req/rx-req.ts](../packages/rx-nostr/src/rx-req/rx-req.ts)
- [.changeset/tidy-badgers-smile.md](../.changeset/tidy-badgers-smile.md)

新規テストは対象機能の既存spec/unit fileに追加し、適切な既存fileがなければ同じ層に作成する。

## 実装内容

1. 両 README、日本語 v4 の全コード例、API 名、型、リンク、Changeset の descriptor 記述を現行 API へ更新する。
2. RxReq.dispose は source completion であり、forward の最後の segment は継続、backward は active/queued segment を drain することを説明する。通信を止める subscription.unsubscribe と区別する。
3. signer/verifier の class 化、constructor defaults、relay-first、config/options の指定可能範囲、process-wide logSink を型と照合する。
4. rx-nostr/legacy の createLegacyRxNostr は v3-shaped facade であり完全な v3 alias ではない。実際に保証する互換範囲を示す。
5. ReqPacket の「null で suspend」、NoopSigner の旧 factory 名などの関連 JSDoc/エラー表現も確認する。
6. v2/v3 の歴史的説明は書き換えない。後続の契約変更に伴う docs 修正はその変更タスクが所有する。

## 受入条件

- 新規利用者が README の型の合う完全なサンプルで query / publish を開始できる。
- 日本語 v4 に現行 API として旧 req/descriptor/over が残らない。移行前例には明確なラベルがある。
- dispose、冷/熱 observable、優先順位、legacy 範囲が実装と矛盾しない。
- 省略記法を使った説明片と、そのまま実行可能な例を区別する。
- 英語 v4 の空白を失敗条件にしない。

## 検証シナリオ

最小例を一時 consumer または検査 fixture で tsc に通す。VitePress build はサンプルを型検査しない。正式な継続検査はタスク25で整備するが、このタスクの例の正しさは本タスク内で確認する。Runtime 条件の詳細は16と整合させる。

最低限の検証コマンド（新しい検査scriptを追加した場合はその実行も含める）:

```sh
pnpm docs:build
pnpm --filter rx-nostr typecheck
pnpm format:check
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
