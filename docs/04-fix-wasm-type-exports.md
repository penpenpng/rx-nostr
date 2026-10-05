# 04 — F04: WASM パッケージの型 exports を修正する

優先度: **P1**。対応元: **F04**。状態: **未着手**。

## 目的と背景

WASM の JS entry は dist/rx-nostr-crypto-wasm.js、型は dist/index.d.ts。トップレベルの types はあるが exports["."] に types 条件がない。独立 consumer の NodeNext strict 型検査で、型ファイルが存在しても exports 制約により TS7016 となった。package 自身の build と JS import は成功する。

## 主な対象

- [packages/crypto-wasm/package.json](../packages/crypto-wasm/package.json)
- [packages/crypto-wasm/vite.config.ts](../packages/crypto-wasm/vite.config.ts)
- [packages/crypto/package.json](../packages/crypto/package.json)
- [packages/rx-nostr/package.json](../packages/rx-nostr/package.json)

新規テストは対象機能の既存spec/unit fileに追加し、適切な既存fileがなければ同じ層に作成する。

## 実装内容

1. exports に生成物と一致する types 経路を追加し、条件順序も他パッケージと揃える。JS entry を不用意に変更しない。
2. development 条件の source 解決と公開 consumer の型解決を混同しない。
3. npm pack 相当の tarball で dist、型、必要な WASM 関連 resource の有無を確認する。files に test source が含まれる差異も是正する。
4. 正常利用者の import を any、ts-ignore、paths alias で迂回しない。

## 受入条件

- 独立 consumer が import { SimpleVerifier } from "@rx-nostr/crypto-wasm" を NodeNext / Bundler で型解決する。
- verifier を RxNostr に渡す型の適合性を確認する。
- JS import と署名/検証の最小呼び出しが配布物だけで動く。
- 必要な resource を保ち、テスト用ファイルを tarball から除外する。

## 検証シナリオ

consumer は workspace の alias / custom development condition を使わない。NodeNext は --module nodenext --moduleResolution nodenext、Bundler は --module esnext --moduleResolution bundler として --noEmit --strict で検査する。広い配布 CI は24の担当だが、この修正単体でも実 consumer で確認する。

最低限の検証コマンド（新しい検査scriptを追加した場合はその実行も含める）:

```sh
pnpm --filter @rx-nostr/crypto-wasm build
pnpm --filter @rx-nostr/crypto-wasm test
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
