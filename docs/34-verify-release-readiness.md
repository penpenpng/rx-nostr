# 34 — 最終検証: version 適用後の公開契約を確認する

優先度: **P1**。対応元: **公開前完了条件**。状態: **未着手**。

## 目的と背景

監査時のchangeset statusはrx-nostr、crypto、crypto-wasmを全て4.0.0へ進める計画だった。現在の3.x/~3表記だけは確定不具合ではない。しかしversion適用後のpeer、exports、README、changelog、tarballが一致することを公開直前に確認する必要がある。ユーザーは実装とコミットを依頼したがnpm公開自体は依頼していない。

## 主な対象

- [.changeset](../.changeset)
- [package.json](../package.json)
- [packages/rx-nostr/package.json](../packages/rx-nostr/package.json)
- [packages/crypto/package.json](../packages/crypto/package.json)
- [packages/crypto-wasm/package.json](../packages/crypto-wasm/package.json)
- [.github/workflows/release.yml](../.github/workflows/release.yml)
- [.github/workflows/test-and-build.yml](../.github/workflows/test-and-build.yml)

新規テストは対象機能の既存spec/unit fileに追加し、適切な既存fileがなければ同じ層に作成する。

## 実装内容

1. 全タスクの受入条件と検証ログを確認し、F15だけを許容事項として記録する。
2. Changesetを点検し、公開契約変更とcryptoの破壊的変更の説明が欠けないようにする。
3. version適用の検証は必要なら一時checkoutで行い、通常のrelease workflowが管理するversionを本branchで先取りしない。
4. version後のpeer range/型/exportsとtarball consumerを検査し、全test/build/docs/lint/formatを通す。
5. 新たな不一致は修正して再検証する。未実行項目は成功とせず理由を記録する。npm publish、push、mergeはこのタスクに含めない。

## 受入条件

- 許容済みF15以外の残件が解消し、各taskの結果が追跡可能。
- version後の全public packageが互換peerと正しいentryを持つ。
- tests、docs examples、packed consumers、runtime matrixが成功する。
- 公開に必要な手順と残る外部操作だけが明確に記録される。

## 検証シナリオ

最後にgit diff/statusを確認し、生成物や一時consumerが誤って追跡されていないことを確認する。taskごとのcommitを維持し、テストを通すためにskipや期待値緩和を追加しない。

最低限の検証コマンド（新しい検査scriptを追加した場合はその実行も含める）:

```sh
pnpm changeset:status
pnpm test
pnpm build
pnpm docs:build
pnpm lint
pnpm format:check
```

変更したファイルのformatter/lintも実行する。広範囲の変更ではrootの `pnpm test` / `pnpm build` で全体回帰を確認する。

## 依存関係と担当境界

先行タスク: [03: F03: README と日本語 v4 docs を現行 API に揃える](03-align-v4-documentation.md)、[04: F04: WASM パッケージの型 exports を修正する](04-fix-wasm-type-exports.md)、[16: F16: runtime と polyfill のサポート契約を定義する](16-define-runtime-support.md)、[17: 内部設計: 公開値と内部状態の所有権を統一する](17-standardize-public-value-ownership.md)、[18: 内部設計: 操作の完了とリソース解放の責務を整理する](18-clarify-operation-lifecycle.md)、[19: 内部設計: 入力正規化の境界を整理する](19-centralize-input-boundaries.md)、[20: 内部設計: RelayDirectory の拡張可能性を明確にする](20-clarify-directory-extension.md)、[21: API設計: timeout と linger の数値契約を揃える](21-validate-numeric-options.md)、[22: API設計: EVENT の構造検査と暗号検証を区別する](22-define-event-validation-contract.md)、[23: テスト拡充: crypto 二実装の共通検証ベクタ](23-expand-crypto-vectors.md)、[24: テスト拡充: tarball の public entry と型を検査する](24-test-packed-consumers.md)、[25: テスト拡充: README と docs のサンプルを型検査する](25-typecheck-documentation-examples.md)、[26: テスト拡充: publication の observer と再入](26-test-publication-reentrancy.md)、[27: テスト拡充: legacy facade の互換契約](27-expand-legacy-contract-tests.md)、[28: テスト拡充: filter の境界と入力形式の同値性](28-expand-filter-boundary-tests.md)、[29: テスト拡充: operators と packet option の保持](29-expand-operator-contract-tests.md)、[30: テスト拡充: Worker verifier の protocol と実 Worker](30-test-worker-verifier-protocol.md)、[31: テスト拡充: RxReq と query の寿命を検証する](31-test-request-lifecycle.md)、[32: テスト拡充: 最低サポート runtime で配布物を実行する](32-test-supported-runtimes.md)、[33: テスト拡充: 実 signer/verifier と既定動作の統合](33-test-default-stack-integration.md)

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
