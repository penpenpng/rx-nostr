# 16 — F16: runtime と polyfill のサポート契約を定義する

優先度: **P2**。対応元: **F16**。状態: **未着手**。

## 目的と背景

本体は module 評価時に DisposableStack を継承し、Set 集合演算、toSorted 等を使う。DisposableStack がない環境では client 構築前に import が失敗する。polyfill は devDependency とテスト側にあり consumer に自動提供されない。導入 docs は WebSocket 注入を説明するが他の必須組み込み機能の下限を示していない。監査は Node24.13.1で成功したが、それ以外の実環境全てを検証したわけではない。

## 主な対象

- [packages/rx-nostr/src/libs/rxjs/rx-disposable-stack.ts](../packages/rx-nostr/src/libs/rxjs/rx-disposable-stack.ts)
- [packages/rx-nostr/src/rx-relays/rx-relays.ts](../packages/rx-nostr/src/rx-relays/rx-relays.ts)
- [packages/rx-nostr/src/libs/relay-urls.ts](../packages/rx-nostr/src/libs/relay-urls.ts)
- [packages/rx-nostr/package.json](../packages/rx-nostr/package.json)
- [packages/docs/ja/v4/installation.md](../packages/docs/ja/v4/installation.md)
- [.github/workflows/test-and-build.yml](../.github/workflows/test-and-build.yml)

新規テストは対象機能の既存spec/unit fileに追加し、適切な既存fileがなければ同じ層に作成する。

## 実装内容

1. 配布 JS と直接依存を調べ、実行時に必要な機能を列挙する。テスト helper のみの要件は分ける。
2. Node/browser のサポート下限と polyfill 方針を選び、理由と実検証を記録する。外部の対応状況を引用する場合は最新の一次資料を確認する。
3. installation、README、必要なら engines に前提を明記する。polyfill 使用時は本体 import より先に読み込む実行可能な例を示す。
4. 必要性なく全ての旧環境対応やグローバル polyfill の自動注入を導入しない。既存 WebSocket 構造型注入は維持する。

## 受入条件

- 対応する runtime と必要機能が具体的に記述される。
- 最低サポート環境で polyfill 方針に従った bare import と最小利用が動く。
- Unsupported な環境の前提不足が説明され、WebSocket 注入だけで足りると誤認させない。
- 英語 v4 の空白（許容済み F15）を修正対象にしない。

## 検証シナリオ

別プロセスで DisposableStack がない環境を再現し、docs の polyfill 手順で import が回復することを確認する。模擬的な機能削除だけで実ブラウザ対応を保証したと主張しない。継続的 runtime matrix と実ブラウザ smoke は32で整備する。

最低限の検証コマンド（新しい検査scriptを追加した場合はその実行も含める）:

```sh
pnpm build
pnpm docs:build
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
