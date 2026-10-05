# 31 — テスト拡充: RxReq と query の寿命を検証する

優先度: **P2**。対応元: **RxReq/lifecycleテスト**。状態: **未着手**。

## 目的と背景

source.dispose、piped.dispose、subscription.unsubscribe、RxNostr.disposeは異なる所有者を終了する。forwardはsource completion後も最新segmentを継続し、backwardはactive/queuedをdrainする。派生requestの値通知だけのテストでは所有権の誤りを検知できない。

## 主な対象

- [packages/rx-nostr/src/rx-req/rx-req.test.ts](../packages/rx-nostr/src/rx-req/rx-req.test.ts)
- [packages/rx-nostr/src/**test**/specs/query.spec.ts](../packages/rx-nostr/src/__test__/specs/query.spec.ts)
- [packages/rx-nostr/src/**test**/specs/connection-demand.spec.ts](../packages/rx-nostr/src/__test__/specs/connection-demand.spec.ts)
- [packages/rx-nostr/src/**test**/specs/facade.spec.ts](../packages/rx-nostr/src/__test__/specs/facade.spec.ts)

新規テストは対象機能の既存spec/unit fileに追加し、適切な既存fileがなければ同じ層に作成する。

## 実装内容

1. 親/派生/兄弟/多段pipeと複数subscriberを組み合わせ、誰が停止し誰が継続するか表を作る。
2. timer operatorがpendingの時、queryがqueue/AUTH/retry/linger中の時の終了を検査する。
3. RxNostr.disposeでactive queryがcompleteし、新しいcold query購読はerrorになることを検査する。
4. forward継続/backward drainと即時subscription取消を分け、negative assertionを入れる。
5. shared leaseで一方の終了が他方の通信を止めないことを確認する。

## 受入条件

- dispose後の新規通知/送信が必要な範囲で止まる。
- 終了していない兄弟や別operationは継続できる。
- timer/queue/connectionの後始末が可観測な結果で確認される。
- disposeが冪等で、unhandled errorを残さない。

## 検証シナリオ

scenarioTestでfake timer、deferred protocol、close acknowledgementを使う。queue inspectorで「届かない」を実時間timeout待ちにせず、明示的な時刻進行とinbox長で確認する。

最低限の検証コマンド（新しい検査scriptを追加した場合はその実行も含める）:

```sh
pnpm --filter rx-nostr test:unit src/rx-req
pnpm --filter rx-nostr test:contract src/__test__/specs/query.spec.ts src/__test__/specs/connection-demand.spec.ts src/__test__/specs/facade.spec.ts
pnpm --filter rx-nostr typecheck
```

変更したファイルのformatter/lintも実行する。広範囲の変更ではrootの `pnpm test` / `pnpm build` で全体回帰を確認する。

## 依存関係と担当境界

先行タスク: [14: F14: 派生 RxReq の寿命を独立して管理する](14-dispose-derived-rxreq.md)、[18: 内部設計: 操作の完了とリソース解放の責務を整理する](18-clarify-operation-lifecycle.md)

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
