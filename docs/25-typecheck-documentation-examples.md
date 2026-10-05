# 25 — テスト拡充: README と docs のサンプルを型検査する

優先度: **P1**。対応元: **docsテスト**。状態: **未着手**。

## 目的と背景

VitePressはMarkdownを描画するだけで、存在しないreq/RxForwardReqを使うサンプルでも成功する。F03で修正した例が再び陳腐化しないよう、実際に読者へ示すコードと検証対象を結び付ける。空の英語v4はユーザーが許容済みなので検査対象外である。

## 主な対象

- [README.md](../README.md)
- [packages/rx-nostr/README.md](../packages/rx-nostr/README.md)
- [packages/docs/ja/v4](../packages/docs/ja/v4)
- [packages/docs/package.json](../packages/docs/package.json)
- [package.json](../package.json)
- [.github/workflows/test-and-build.yml](../.github/workflows/test-and-build.yml)

新規テストは対象機能の既存spec/unit fileに追加し、適切な既存fileがなければ同じ層に作成する。

## 実装内容

1. README/getting-started/query/publish/AUTH/signer-verifierの主要例を列挙し、完全例と説明用snippetを分類する。
2. Markdownからの抽出、または検査済みexample sourceの埋め込みで、検査対象と表示内容が乖離しない仕組みを作る。
3. 省略されたrelays/pubkey/render等の宣言はfixture側で明示する。any/ts-ignoreでAPI誤りを隠さない。
4. real package importで型検査する。v2/v3の旧API例とmigrationのbefore例は現行APIの検査から明示的に除く。
5. docs buildとは別の失敗をCIで見えるようにする。F15を理由に空白英語ページでCIを落とさない。

## 受入条件

- 存在しないexport/methodを例へ入れると失敗する。
- 主要例は実際の型を使って成功する。
- 更新対象のMarkdown pathとsnippetがログから特定できる。
- 未定義変数を隠す広範な型無効化を使わない。

## 検証シナリオ

型検査で保証できないcold/hot/lifecycleの挙動は既存contractを参照し、必要なら少数の実行exampleを追加する。ブラウザWorker例はDOM型設定を分け、Node用wsの例と一緒くたにしない。

最低限の検証コマンド（新しい検査scriptを追加した場合はその実行も含める）:

```sh
pnpm build
pnpm docs:build
```

変更したファイルのformatter/lintも実行する。広範囲の変更ではrootの `pnpm test` / `pnpm build` で全体回帰を確認する。

## 依存関係と担当境界

先行タスク: [03: F03: README と日本語 v4 docs を現行 API に揃える](03-align-v4-documentation.md)、[24: テスト拡充: tarball の public entry と型を検査する](24-test-packed-consumers.md)

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
