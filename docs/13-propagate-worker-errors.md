# 13 — F13: Worker verifier の処理例外を伝播する

優先度: **P2**。対応元: **F13**。状態: **未着手**。

## 目的と背景

Host は verifier 例外を {reqId,ok:false,error:string} として送るが、Client は error を捨て false で resolve する。直接 verifier と fallback は例外を伝播し、query が RxNostrCallbackError("verifier") になる。Worker に移しただけで処理障害が署名不正として黙って破棄される。

## 主な対象

- [packages/rx-nostr/src/event-verifier/worker-verifier.ts](../packages/rx-nostr/src/event-verifier/worker-verifier.ts)
- [packages/rx-nostr/src/rx-nostr/rx-nostr.ts](../packages/rx-nostr/src/rx-nostr/rx-nostr.ts)
- [packages/rx-nostr/src/libs/error.ts](../packages/rx-nostr/src/libs/error.ts)
- [packages/docs/ja/v4/signer-verifier.md](../packages/docs/ja/v4/signer-verifier.md)

新規テストは対象機能の既存spec/unit fileに追加し、適切な既存fileがなければ同じ層に作成する。

## 実装内容

1. protocol 上で正常な false と処理エラーを区別し、後者を reject する。
2. 既に公開されている VerificationRequest/Response 型を考慮する。既存 error field の利用で足りるか確認し、不必要に破壊的な wire 変更をしない。
3. Worker 境界では元の Error identity/stack が維持されない点を docs に記す。文字列を安全な Error に変換し、元の機密情報を余分に送らない。
4. 11の pending cleanup、12の timeout cleanup を全エラー経路で利用する。

## 受入条件

- false は resolve(false)、Host 例外は reject となる。
- query に組み込むと callback kind verifier の typed error になる。
- 直接・fallback・Worker で正常/false/例外の分類が一致する。
- unknown reqId、重複/遅延応答が別 request を終了しない。
- 既存利用者に対する型と protocol の互換性判断を記録する。

## 検証シナリオ

throw Error、throw string、false の三例を明示する。worker mock に加え Host の handler も検査し、Client へ手で正しい response を送るだけで終えない。実 Worker 検査の恒常化は30。

最低限の検証コマンド（新しい検査scriptを追加した場合はその実行も含める）:

```sh
pnpm --filter rx-nostr test:unit
pnpm --filter rx-nostr test:contract src/__test__/specs/query.spec.ts
pnpm --filter rx-nostr typecheck
```

変更したファイルのformatter/lintも実行する。広範囲の変更ではrootの `pnpm test` / `pnpm build` で全体回帰を確認する。

## 依存関係と担当境界

先行タスク: [12: F12: Worker verifier の timeout を正しい deadline にする](12-enforce-worker-deadline.md)

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
