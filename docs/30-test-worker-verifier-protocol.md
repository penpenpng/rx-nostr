# 30 — テスト拡充: Worker verifier の protocol と実 Worker

優先度: **P2**。対応元: **Workerテスト**。状態: **未着手**。

## 目的と背景

Worker verifierに専用テストがなく、pending漏れ、倍のtimeout、errorの黙殺を見逃した。Clientだけに人工responseを与えるテストでは、Hostとのprotocol接続やbrowser Workerの実環境要件を保証しない。Node worker_threadsはWorkerGlobalScopeと同一ではない。

## 主な対象

- [packages/rx-nostr/src/event-verifier/worker-verifier.ts](../packages/rx-nostr/src/event-verifier/worker-verifier.ts)
- [packages/rx-nostr/src/**test**/support](../packages/rx-nostr/src/__test__/support)
- [packages/docs/ja/v4/signer-verifier.md](../packages/docs/ja/v4/signer-verifier.md)
- [packages/rx-nostr/vitest.config.ts](../packages/rx-nostr/vitest.config.ts)

新規テストは対象機能の既存spec/unit fileに追加し、適切な既存fileがなければ同じ層に作成する。

## 実装内容

1. prepared/booting/active/error/terminated、ping/pong、fallback有無の状態表を検査する。
2. Hostのtrue/false/例外response、複数reqId、遅延/重複/unknown responseを検査する。
3. dispose、timeout、worker error/messageerror、postMessage同期例外、pending中のfallback方針を検査する。
4. 対応browserで実module Workerを起動する最小smoke testを用意する。必要なrunner追加はruntime/依存方針と整合させる。
5. mockで検査した範囲と実Workerで確認する範囲を分け、CI未実行なら理由を明示する。

## 受入条件

- HostとClientを接続した検証が実際に成功/false/errorを区別する。
- 全terminal経路でPromiseとtimer/listenerが片付く。
- Worker内でimport、start、message交換、disposeが動く。
- fragileな実時間sleepや意図しないskipを使わない。

## 検証シナリオ

単体はfake workerとfake timers、実Workerは少数のsmokeに限定する。package rootからHost/Clientをimportし、Worker専用context guardも検査する。

最低限の検証コマンド（新しい検査scriptを追加した場合はその実行も含める）:

```sh
pnpm --filter rx-nostr test:unit
pnpm --filter rx-nostr typecheck
```

変更したファイルのformatter/lintも実行する。広範囲の変更ではrootの `pnpm test` / `pnpm build` で全体回帰を確認する。

## 依存関係と担当境界

先行タスク: [11: F11: Worker verifier の pending request を終了する](11-settle-worker-on-dispose.md)、[12: F12: Worker verifier の timeout を正しい deadline にする](12-enforce-worker-deadline.md)、[13: F13: Worker verifier の処理例外を伝播する](13-propagate-worker-errors.md)、[16: F16: runtime と polyfill のサポート契約を定義する](16-define-runtime-support.md)、[21: API設計: timeout と linger の数値契約を揃える](21-validate-numeric-options.md)

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
