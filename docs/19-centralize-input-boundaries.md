# 19 — 内部設計: 入力正規化の境界を整理する

優先度: **P2**。対応元: **設計改善3**。状態: **未着手**。

## 目的と背景

同じquery filterをstatic/emittedで異なる経路へ流すことと、同じEventVerifier契約の通常版/WASM版の意味の差が監査で見つかった。局所修正後に責務が散らばったままだと再発する。ただしquery正規化と暗号実装を同じruntime moduleへまとめる必要はない。

## 主な対象

- [packages/rx-nostr/src/rx-nostr/rx-nostr.ts](../packages/rx-nostr/src/rx-nostr/rx-nostr.ts)
- [packages/rx-nostr/src/rx-req/normalize-filters.ts](../packages/rx-nostr/src/rx-req/normalize-filters.ts)
- [packages/rx-nostr/src/lazy-filter/lazy-filter.ts](../packages/rx-nostr/src/lazy-filter/lazy-filter.ts)
- [packages/rx-nostr/src/rx-nostr/operation/req/options.ts](../packages/rx-nostr/src/rx-nostr/operation/req/options.ts)
- [packages/crypto/src/libs/nostr/crypto.ts](../packages/crypto/src/libs/nostr/crypto.ts)
- [packages/crypto-wasm/src/libs/nostr/crypto.ts](../packages/crypto-wasm/src/libs/nostr/crypto.ts)

新規テストは対象機能の既存spec/unit fileに追加し、適切な既存fileがなければ同じ層に作成する。

## 実装内容

1. filterの構造正規化、lazy評価、受信matching、暗号検証の入口と出力保証を明示する。
2. 同じ段階の検査が複数箇所で異なる方針を持たないよう整理する。callbackの評価時点と例外分類は変えない。
3. crypto二実装は共通契約とfixtureで揃え、片方がもう片方をruntime importする依存は作らない。
4. 入力snapshotのタイミングと、利用者による入力変更を許容する範囲を決めてJSDocに残す。
5. 追加抽象化は具体的な重複や境界違反を解消するものに限定する。

## 受入条件

- filterのstatic/emitted/piped経路が同じ正規化契約を通る。
- lazyの送信直前・再送時評価、verifierの受信時検証が守られる。
- 不正入力がsilentな全件化や未検証受理を起こさない。
- パッケージ間の循環依存と不要なcrypto依存を本体へ導入しない。

## 検証シナリオ

09の同値性テストと01のID改変ベクタを再実行する。新しい境界説明に対応する最小統合テストを付ける。型guardの厳密さは22で別途定義する。

最低限の検証コマンド（新しい検査scriptを追加した場合はその実行も含める）:

```sh
pnpm test
pnpm build
```

変更したファイルのformatter/lintも実行する。広範囲の変更ではrootの `pnpm test` / `pnpm build` で全体回帰を確認する。

## 依存関係と担当境界

先行タスク: [01: F01: EVENT の ID と署名検証の整合性](01-verify-event-id.md)、[08: F08: filter の 0 の時刻境界を保持する](08-preserve-zero-time-bounds.md)、[09: F09: static と emitted filter の意味を統一する](09-unify-query-filter-inputs.md)

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
