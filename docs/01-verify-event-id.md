# 01 — F01: EVENT の ID と署名検証の整合性

優先度: **P1**。対応元: **F01**。状態: **完了**。

## 目的と背景

通常版 verifyEvent() は schnorr.verify(event.sig, getEventHash(event), event.pubkey) を実行するだけで、event.id と再計算ハッシュを比較しない。正常署名済みイベントの ID だけを "0".repeat(64) に変えると通常版は true、WASM は false となる。署名自体の偽造ではないが、検証済み ID を利用する filter、重複排除、cache、参照が破綻する。両パッケージの SimpleVerifier は共通の EventVerifier 契約で差し替え可能である。

## 主な対象

- [packages/crypto/src/libs/nostr/crypto.ts](../packages/crypto/src/libs/nostr/crypto.ts)
- [packages/crypto/src/event-verifier/simple-verifier.ts](../packages/crypto/src/event-verifier/simple-verifier.ts)
- [packages/crypto/src/event-verifier/simple-verifier.test.ts](../packages/crypto/src/event-verifier/simple-verifier.test.ts)
- [packages/crypto-wasm/src/libs/nostr/crypto.ts](../packages/crypto-wasm/src/libs/nostr/crypto.ts)
- [packages/crypto-wasm/src/event-verifier/simple-verifier.test.ts](../packages/crypto-wasm/src/event-verifier/simple-verifier.test.ts)

新規テストは対象機能の既存spec/unit fileに追加し、適切な既存fileがなければ同じ層に作成する。

## 実装内容

1. 通常版で再計算したハッシュと ID の一致を検査し、その同じハッシュで署名を検証する。
2. 不正入力に false を返す既存の verifyEvent 契約を保つ。正常入力を誤って拒否しない。
3. 最小回帰テストを両パッケージに追加する。正規 ID、改変 ID、content 改変、sig 改変、欠落フィールドを区別する。
4. 構造 validator の全体整理はタスク22、共有ベクタの拡充は23で行う。本件の修正をそれらの完了待ちにしない。

## 受入条件

- ID だけを改変した正常署名イベントを通常版・WASM 版とも拒否する。
- 通常版で正常例が成功し、SimpleVerifier 経由でも同じ結果になる。
- crypto の変更が本体への runtime 依存やパッケージ間の循環依存を作らない。
- NIP-01 の ID と署名の関係をテスト名またはコメントで示す。

## 検証シナリオ

再現用の固定テスト鍵は "0".repeat(63) + "1"。signEvent({kind:1, content:"audit", created_at:1, tags:[]}, key) で正常例を作り、spread で ID のみ変更する。署名と期待値の両方を同じ壊れた verifier から作らない。基準: https://github.com/nostr-protocol/nips/blob/master/01.md#events-and-signatures

最低限の検証コマンド（新しい検査scriptを追加した場合はその実行も含める）:

```sh
pnpm --filter @rx-nostr/crypto test
pnpm --filter @rx-nostr/crypto-wasm test
pnpm --filter @rx-nostr/crypto build
pnpm --filter @rx-nostr/crypto-wasm build
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

再計算hashとevent.idの一致を署名検証前に要求した。通常版の改変IDテストが修正前に失敗することを確認し、修正後は通常版/WASM版とも6テスト成功。両packageのbuildも成功。構造検査の追加は22、共通ベクタ拡充は23で扱う。
