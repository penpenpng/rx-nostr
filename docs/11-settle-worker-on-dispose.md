# 11 — F11: Worker verifier の pending request を終了する

優先度: **P2**。対応元: **F11**。状態: **未着手**。

## 目的と背景

VerificationClient は pending reqId に resolve だけを保持し、dispose で worker/listener/Batch timer を止めても Promise を終了しない。active で verifyEvent を開始し応答前に dispose すると、timeout 後も永久に pending となる。prepared/booting/active/error/terminated の状態を持つ。

## 主な対象

- [packages/rx-nostr/src/event-verifier/worker-verifier.ts](../packages/rx-nostr/src/event-verifier/worker-verifier.ts)
- [packages/rx-nostr/src/event-verifier/event-verifier.interface.ts](../packages/rx-nostr/src/event-verifier/event-verifier.interface.ts)
- [packages/docs/ja/v4/signer-verifier.md](../packages/docs/ja/v4/signer-verifier.md)
- [packages/docs/ja/v4/dispose.md](../packages/docs/ja/v4/dispose.md)

新規テストは対象機能の既存spec/unit fileに追加し、適切な既存fileがなければ同じ層に作成する。

## 実装内容

1. pending request を resolve/reject/cleanup 付きで管理し、dispose 時にすべて reject して参照を解放する。
2. duplicate dispose、late response、応答直後の dispose が二重 settlement を起こさないようにする。
3. worker error/messageerror と postMessage 同期例外でも進行中 request を放置しない方針を決める。error 状態の新規リクエストの fallback は維持する。
4. Promise の rejection は呼び出し側が処理できる形にする。pending を隠すための無条件 catch や false への変換は使わない。

## 受入条件

- 複数 pending request が dispose で全て速やかに reject する。
- resolver、timeout callback、listener、worker が解放される。
- dispose 後に再利用できず、late message が状態を active に戻さない。
- エラー時の既存 fallback と通常成功が回帰しない。

## 検証シナリオ

制御 worker mock は add/removeEventListener、postMessage、terminate と message 発行を持たせる。Promise の rejection 観測を登録してから dispose し、fake timer を進めなくても終了することを検査する。次の12/13が同じファイルを変更するので順次統合する。

最低限の検証コマンド（新しい検査scriptを追加した場合はその実行も含める）:

```sh
pnpm --filter rx-nostr test:unit
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
