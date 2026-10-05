# 32 — テスト拡充: 最低サポート runtime で配布物を実行する

優先度: **P2**。対応元: **runtimeテスト**。状態: **未着手**。

## 目的と背景

監査の既存CIはNode24で、test sourceがpolyfillをimportする。consumerがpolyfillなしでどこまで動くか、docsの最低runtimeで配布物を使えるかは別の保証である。16でサポート契約を確定してから、その下限を継続検証する。

## 主な対象

- [.github/workflows/test-and-build.yml](../.github/workflows/test-and-build.yml)
- [packages/rx-nostr/package.json](../packages/rx-nostr/package.json)
- [packages/docs/ja/v4/installation.md](../packages/docs/ja/v4/installation.md)
- [packages/rx-nostr/src/types/websocket.ts](../packages/rx-nostr/src/types/websocket.ts)

新規テストは対象機能の既存spec/unit fileに追加し、適切な既存fileがなければ同じ層に作成する。

## 実装内容

1. 16のNode/browser範囲に対応する小さなCI matrixを追加する。根拠なく旧環境を増やさない。
2. packed entryのbare import、RxNostr/RxReq/RxRelaysの構築・集合演算・dispose、cryptoの最小呼び出しを行う。
3. native機能がある環境とdocsのpolyfill経路を分け、読み込み順も検査する。
4. browserでmodule/Worker/resource解決を代表例で確認する。実リレーへは接続しない。
5. 実環境を使わない機能削除simulationは補助検査と明記する。

## 受入条件

- 対応最低環境がCIで検査される。
- polyfillをtest setupに隠してbare importの保証を偽らない。
- WebSocket注入型とruntime adapterが実際に使える。
- unsupported環境を黙ってsupportedと扱わない。

## 検証シナリオ

24のconsumerを再利用し、setup/packをむやみに重複させない。外部runner導入やサポート範囲の選択にユーザー判断が必要なら具体的な候補と保守コストを示す。

最低限の検証コマンド（新しい検査scriptを追加した場合はその実行も含める）:

```sh
pnpm build
pnpm test
```

変更したファイルのformatter/lintも実行する。広範囲の変更ではrootの `pnpm test` / `pnpm build` で全体回帰を確認する。

## 依存関係と担当境界

先行タスク: [16: F16: runtime と polyfill のサポート契約を定義する](16-define-runtime-support.md)、[24: テスト拡充: tarball の public entry と型を検査する](24-test-packed-consumers.md)

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
