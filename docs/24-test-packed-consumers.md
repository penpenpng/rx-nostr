# 24 — テスト拡充: tarball の public entry と型を検査する

優先度: **P1**。対応元: **配布テスト**。状態: **未着手**。

## 目的と背景

contract testはrx-nostrをsrcへaliasするため、exportsの不備やtarball内の欠落を検出しない。WASMで実際に型解決の失敗が起きた。root/operators/utils/legacyおよびcrypto二種を、repository sourceへ逃げない独立consumerで検査する。

## 主な対象

- [packages/rx-nostr/vitest.config.ts](../packages/rx-nostr/vitest.config.ts)
- [packages/rx-nostr/package.json](../packages/rx-nostr/package.json)
- [packages/crypto/package.json](../packages/crypto/package.json)
- [packages/crypto-wasm/package.json](../packages/crypto-wasm/package.json)
- [.github/workflows/test-and-build.yml](../.github/workflows/test-and-build.yml)
- [package.json](../package.json)

新規テストは対象機能の既存spec/unit fileに追加し、適切な既存fileがなければ同じ層に作成する。

## 実装内容

1. 各packageをbuild/packし、隔離したconsumerへtarballを導入する再実行可能なscriptを追加する。workspace aliasやdevelopment条件は使わない。
2. ESM runtime importとNodeNext/Bundler strict型検査を行う。entryごとに代表的なexportと型を使い、any化が成功条件にならないよう検査する。
3. consumerはnostr-typedef等のpublic peerを明示的に導入し、workspaceのdevDependency漏れに頼らない。
4. packed file listのdist/型/WASM resource/READMEを検査し、test/helperの混入を防ぐ。
5. CIへ追加し、失敗時にentryと解決方式がわかるログを残す。network不可時に黙ってskipしない。

## 受入条件

- 正規tarballで全entryのruntime/type検査が通る。
- WASM types条件を意図的に削ると検査が失敗する。
- consumerから未公開source subpathへimportしない。
- clean installとcleanupが可能で、repositoryのversion/lockfileを勝手に更新しない。

## 検証シナリオ

一時dirはscriptが作成し終了時cleanupする。packのprepack実行と依存関係の順序を考慮する。最低runtimeでの広いmatrixは32、version適用後のrelease確認は34に分離する。

最低限の検証コマンド（新しい検査scriptを追加した場合はその実行も含める）:

```sh
pnpm build
pnpm test
```

変更したファイルのformatter/lintも実行する。広範囲の変更ではrootの `pnpm test` / `pnpm build` で全体回帰を確認する。

## 依存関係と担当境界

先行タスク: [04: F04: WASM パッケージの型 exports を修正する](04-fix-wasm-type-exports.md)、[16: F16: runtime と polyfill のサポート契約を定義する](16-define-runtime-support.md)

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
