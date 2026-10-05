# 06 — F06: legacy AUTH adapter の委譲を修正する

優先度: **P2**。対応元: **F06**。状態: **未着手**。

## 目的と背景

withLegacyAuthTimeout は {...authenticator, authTimeout: authenticator.authTimeout ?? authTimeout} を返す。prototype 上の challenge は spread で失われる。SimpleAuthenticator の instance と legacy authTimeout を組み合わせると、wrapper.challenge が undefined となる。Factory が class を返す場合にも同じ問題がある。

## 主な対象

- [packages/rx-nostr/src/legacy/adapters.ts](../packages/rx-nostr/src/legacy/adapters.ts)
- [packages/rx-nostr/src/legacy/client.ts](../packages/rx-nostr/src/legacy/client.ts)
- [packages/rx-nostr/src/authenticator/simple-authenticator.ts](../packages/rx-nostr/src/authenticator/simple-authenticator.ts)
- [packages/rx-nostr/src/authenticator/authenticator.interface.ts](../packages/rx-nostr/src/authenticator/authenticator.interface.ts)
- [packages/rx-nostr/src/**test**/specs/legacy.spec.ts](../packages/rx-nostr/src/__test__/specs/legacy.spec.ts)

新規テストは対象機能の既存spec/unit fileに追加し、適切な既存fileがなければ同じ層に作成する。

## 実装内容

1. challenge を元 object へ委譲し、this と private state を保持する。
2. authenticator 自身の authTimeout が優先され、未指定時だけ legacy timeout を用いる現在の優先順位を維持する。0 と Infinity を truthiness で失わない。
3. factory が undefined を返す opt-out と factory/challenge の例外ラッピングを維持する。
4. 単体検査だけでなく legacy client から AUTH が送られる契約テストを追加する。

## 受入条件

- class、object literal、class を返す factory のすべてで challenge が呼べる。
- private field を読む challenge の this が維持される。
- timeout の優先順位、AUTH disabled、callback error が正しい。
- 元の authenticator を書き換えない。

## 検証シナリオ

new SimpleAuthenticator(new NoopSigner()) の original.challenge と adapter 後の challenge の型を確認すると最小再現になる。AUTH 契約テストでは署名 stub で kind 22242、relay/challenge tag を明示し、OK と timeout を制御する。

最低限の検証コマンド（新しい検査scriptを追加した場合はその実行も含める）:

```sh
pnpm --filter rx-nostr test:contract src/__test__/specs/legacy.spec.ts src/__test__/specs/auth.spec.ts
pnpm --filter rx-nostr typecheck
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
