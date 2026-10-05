# 05 — F05: legacy cast の完了を実際の送信と結び付ける

優先度: **P1**。対応元: **F05**。状態: **未着手**。

## 目的と背景

legacy send(...,{completeOn:"sent"}) は publication.event の resolve で finish() し、finish は publication.cancel() を呼ぶ。event Promise は署名結果の準備であって socket 送信完了ではない。未接続の制御 socket で await cast(event) が成功し、EVENT が 0 件のまま close されることを再現した。受理を示す OK と送信成功も別の事実である。

## 主な対象

- [packages/rx-nostr/src/legacy/client.ts](../packages/rx-nostr/src/legacy/client.ts)
- [packages/rx-nostr/src/legacy/types.ts](../packages/rx-nostr/src/legacy/types.ts)
- [packages/rx-nostr/src/rx-nostr/operation/publish/publication-operation.ts](../packages/rx-nostr/src/rx-nostr/operation/publish/publication-operation.ts)
- [packages/rx-nostr/src/rx-nostr/communication/executor/nostr-operation-executor.ts](../packages/rx-nostr/src/rx-nostr/communication/executor/nostr-operation-executor.ts)
- [packages/rx-nostr/src/rx-nostr/communication/transport/nostr-transport.ts](../packages/rx-nostr/src/rx-nostr/communication/transport/nostr-transport.ts)
- [packages/rx-nostr/src/**test**/specs/legacy.spec.ts](../packages/rx-nostr/src/__test__/specs/legacy.spec.ts)

新規テストは対象機能の既存spec/unit fileに追加し、適切な既存fileがなければ同じ層に作成する。

## 実装内容

1. 送信完了の責務を transport/executor から publication 内部へ明示的に伝える。署名 Promise の解釈変更や OK 待ちによる代用は行わない。
2. legacy cast / completeOn:"sent" は必要な宛先への送信まで待ち、その前に cancel しない。
3. 宛先なし、複数宛先の部分失敗、送信待ち中の切断/取消、AUTH 待機に対する成功/失敗方針を確定し型/JSDoc に記す。既存 v3 docs も参照して互換意図を維持する。
4. 公開 Publication の不要な拡張を避け、必要なら内部 completion port を設ける。unipls の機能は導入済み版の実コード/型で確認する。

## 受入条件

- 未接続では cast は pending、必要な EVENT 送信後に成功する。
- relay の OK が来なくても送信完了として成功できる。
- 必要な送信が失敗した場合に成功を返さない。
- all-ok / any-ok、v4 Publication.event、observer unsubscribe の契約を壊さない。
- 送信後の後始末で再送・タイマー・AUTH 待ちが残らない。

## 検証シナリオ

NoopSigner と制御 socket で開始し、open 前の pending、open 後の inbox EVENT、OK 未到着時の完了を順番に検査する。失敗系では Promise の rejection handler を先に登録する。lifecycle 全体の整理は18、legacy の広いシナリオは27で実施する。

最低限の検証コマンド（新しい検査scriptを追加した場合はその実行も含める）:

```sh
pnpm --filter rx-nostr test:contract src/__test__/specs/legacy.spec.ts src/__test__/specs/publish.spec.ts
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
