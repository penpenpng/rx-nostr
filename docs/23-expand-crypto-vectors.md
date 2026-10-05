# 23 — テスト拡充: crypto 二実装の共通検証ベクタ

優先度: **P2**。対応元: **暗号テスト**。状態: **未着手**。

## 目的と背景

既存verifierテストは正常例、sig欠落、tags欠落を中心にし、IDだけの改変を見逃した。二実装は同じEventSigner/EventVerifierとして利用されるが、テストfixtureが分離している。通常版とWASMをruntimeで相互依存させず、共通契約を同じ入力と期待値で検査する必要がある。

## 主な対象

- [packages/crypto/src/event-verifier/simple-verifier.test.ts](../packages/crypto/src/event-verifier/simple-verifier.test.ts)
- [packages/crypto/src/event-signer/seckey-signer.test.ts](../packages/crypto/src/event-signer/seckey-signer.test.ts)
- [packages/crypto-wasm/src/event-verifier/simple-verifier.test.ts](../packages/crypto-wasm/src/event-verifier/simple-verifier.test.ts)
- [packages/crypto-wasm/src/event-signer/seckey-signer.test.ts](../packages/crypto-wasm/src/event-signer/seckey-signer.test.ts)

新規テストは対象機能の既存spec/unit fileに追加し、適切な既存fileがなければ同じ層に作成する。

## 実装内容

1. source共有またはJSON fixtureをテスト専用の適切な場所へ置く。公開exportsへfixtureを追加しない。
2. 正常・ID/content/pubkey/sig/created_at/tagsの個別改変・欠落・malformedを同じ期待値で二実装へ適用する。
3. signerのhex/nsec入力、既定tags、時刻省略、署名済み入力の扱いを明示する。既に署名済みEVENTへtagsを追加する場合の契約も確認する。
4. 固定された信頼できる署名ベクタを含め、signerとverifierの同じバグが相殺するround tripだけに依存しない。
5. 想定外の実装差が出たらfixtureの期待値を緩めず仕様/実装を修正する。

## 受入条件

- 全ベクタが両実装で同じaccept/reject分類になる。
- 01のID-only改変を明示的に含む。
- ランダム鍵/実時間/実ネットワークに依存しない。
- fixtureにruntime依存・秘密鍵・公開不要ファイルを混入させない。

## 検証シナリオ

通常cryptoはVitest5、WASMはVitest3のため、共有fixtureはrunner固有APIを含まないデータ/純粋関数とする。対応するpackageコマンドでそれぞれ実行し、バージョン差を理由に一方をskipしない。

最低限の検証コマンド（新しい検査scriptを追加した場合はその実行も含める）:

```sh
pnpm --filter @rx-nostr/crypto test
pnpm --filter @rx-nostr/crypto-wasm test
pnpm build
```

変更したファイルのformatter/lintも実行する。広範囲の変更ではrootの `pnpm test` / `pnpm build` で全体回帰を確認する。

## 依存関係と担当境界

先行タスク: [01: F01: EVENT の ID と署名検証の整合性](01-verify-event-id.md)、[22: API設計: EVENT の構造検査と暗号検証を区別する](22-define-event-validation-contract.md)

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
