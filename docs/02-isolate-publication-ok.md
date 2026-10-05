# 02 — F02: OK 通知を内部の成功判定から分離する

優先度: **P1**。対応元: **F02**。状態: **未着手**。

## 目的と背景

PublicationOperation は受信 packet を delivery.lastOk と ReplaySubject の両方へ渡す。同期 observer の実行後に lastOk.ok を成功判定するため、subscribe(p => { p.ok = true; }) がリレーの OK false を成功に変える。replay と後続 observer にも同じ参照が届く。Publication は hot であり、observer の unsubscribe は送信の取消ではない。event Promise は内部送信 snapshot から分離済みである。

## 主な対象

- [packages/rx-nostr/src/rx-nostr/operation/publish/publication-operation.ts](../packages/rx-nostr/src/rx-nostr/operation/publish/publication-operation.ts)
- [packages/rx-nostr/src/rx-nostr/communication/executor/nostr-operation-executor.ts](../packages/rx-nostr/src/rx-nostr/communication/executor/nostr-operation-executor.ts)
- [packages/rx-nostr/src/publication/publication.interface.ts](../packages/rx-nostr/src/publication/publication.interface.ts)
- [packages/rx-nostr/src/**test**/specs/publish.spec.ts](../packages/rx-nostr/src/__test__/specs/publish.spec.ts)
- [packages/rx-nostr/src/**test**/helper/publication-scenario.ts](../packages/rx-nostr/src/__test__/helper/publication-scenario.ts)

新規テストは対象機能の既存spec/unit fileに追加し、適切な既存fileがなければ同じ層に作成する。

## 実装内容

1. 内部 delivery の判定用 OK と外部通知値を分離する。observer 実行後に公開 object を読んで判定しない。
2. observer ごと、replay ごとに mutable な独立値を渡す。ネストした message tuple と failure に含まれる OK も対象にする。単に公開 object を freeze する修正で既存 mutable 契約を破らない。
3. 同じ ID を同じリレーへ送る別 publication が共有 transport packet を通して干渉しないことを確認する。
4. AUTH required の一時的 OK、最終 OK、同期 cancel 等の再入で二重完了や誤成功を起こさない。

## 受入条件

- OK false は observer が true に変えても waitFor("all") / "any" の正しい失敗になる。
- OK true は observer が false に変えても成功する。
- 先行・後続・late observer、failure 読み取りが相互に干渉しない。
- all/any、AUTH 再送、cancel、linger の既存契約が維持される。

## 検証シナリオ

createPublicationScenario と制御 socket を使用する。署名完了と EVENT 送信を明示的に待ってから ["OK", id, false, "blocked: rejected"] を投入する。複数 observer が ok / eventId / message を変更するシナリオと変更しない対照を設ける。横断的な所有権整理は17、再入シナリオの広い拡充は26の担当。

最低限の検証コマンド（新しい検査scriptを追加した場合はその実行も含める）:

```sh
pnpm --filter rx-nostr test:contract src/__test__/specs/publish.spec.ts
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
