# 33 — テスト拡充: 実 signer/verifier と既定動作の統合

優先度: **P2**。対応元: **統合テスト**。状態: **未着手**。

## 目的と背景

標準scenario helperはNoopVerifier、NoopReconnector、skipFetchNip11:trueを注入する。protocol単体には適切だが、実crypto・既定再試行・自動NIP-11取得が組み合わさった動作は保証しない。少数の統合ケースで責務の接続を検査する。

## 主な対象

- [packages/rx-nostr/src/**test**/helper/rx-nostr-scenario.ts](../packages/rx-nostr/src/__test__/helper/rx-nostr-scenario.ts)
- [packages/rx-nostr/src/**test**/helper/protocol-scenario.ts](../packages/rx-nostr/src/__test__/helper/protocol-scenario.ts)
- [packages/rx-nostr/src/**test**/specs/auth.spec.ts](../packages/rx-nostr/src/__test__/specs/auth.spec.ts)
- [packages/rx-nostr/src/**test**/specs/relay-health-recovery.spec.ts](../packages/rx-nostr/src/__test__/specs/relay-health-recovery.spec.ts)
- [packages/rx-nostr/src/**test**/specs/relay-directory.spec.ts](../packages/rx-nostr/src/__test__/specs/relay-directory.spec.ts)
- [packages/crypto/src/index.ts](../packages/crypto/src/index.ts)

新規テストは対象機能の既存spec/unit fileに追加し、適切な既存fileがなければ同じ層に作成する。

## 実装内容

1. 固定テスト鍵の実SeckeySigner/SimpleVerifierとcontrolled socketを組み合わせる。
2. 正常EVENT受信、ID改変拒否、publish署名とOK、SimpleAuthenticatorのAUTHを確認する。
3. 明示的fetcherでNIP-11取得/queueを制御し、既定reconnectorとhealth suppressionをfake timeで検査する。
4. 共有Directoryを持つ複数client、再送、root disposeの代表ケースを追加する。
5. static defaults/logSink/fetch/timersを必ず復元し、テスト間依存を作らない。

## 受入条件

- mock暗号ではなく実署名検証がprotocol全体の中で働く。
- 自動NIP-11とretryを無効化せず成功/回復が検証される。
- 実ネットワークやランダムjitterでflakyにならない。
- package間のtest専用依存を明示し、production依存を増やさない。

## 検証シナリオ

各testは機能を詰め込み過ぎず、一つの統合境界を主目的にする。既定jitterを試す場合はrandomの制御可能点か結果の許容範囲を使い、必要性なく既定policy自体を別mockへ置き換えない。

最低限の検証コマンド（新しい検査scriptを追加した場合はその実行も含める）:

```sh
pnpm test
pnpm build
```

変更したファイルのformatter/lintも実行する。広範囲の変更ではrootの `pnpm test` / `pnpm build` で全体回帰を確認する。

## 依存関係と担当境界

先行タスク: [01: F01: EVENT の ID と署名検証の整合性](01-verify-event-id.md)、[17: 内部設計: 公開値と内部状態の所有権を統一する](17-standardize-public-value-ownership.md)、[18: 内部設計: 操作の完了とリソース解放の責務を整理する](18-clarify-operation-lifecycle.md)、[20: 内部設計: RelayDirectory の拡張可能性を明確にする](20-clarify-directory-extension.md)、[22: API設計: EVENT の構造検査と暗号検証を区別する](22-define-event-validation-contract.md)、[23: テスト拡充: crypto 二実装の共通検証ベクタ](23-expand-crypto-vectors.md)

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
