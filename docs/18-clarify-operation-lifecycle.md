# 18 — 内部設計: 操作の完了とリソース解放の責務を整理する

優先度: **P2**。対応元: **設計改善2**。状態: **未着手**。

## 目的と背景

署名完了、送信完了、OK受理、observer終了、source完了、linger後のresource解放は別の状態である。legacy は署名完了を送信と誤認し、派生RxReqはdisposeの対象を誤った。PublicationOperation の closed は内部cleanupの通知であり、public event や waitFor とは異なる。既存の demand/lease/scheduler の層分離は妥当なので全面再実装は不要。

## 主な対象

- [packages/rx-nostr/src/publication/publication.interface.ts](../packages/rx-nostr/src/publication/publication.interface.ts)
- [packages/rx-nostr/src/rx-nostr/operation/publish/publication-operation.ts](../packages/rx-nostr/src/rx-nostr/operation/publish/publication-operation.ts)
- [packages/rx-nostr/src/rx-nostr/operation/demand/connection-demand-scope.ts](../packages/rx-nostr/src/rx-nostr/operation/demand/connection-demand-scope.ts)
- [packages/rx-nostr/src/rx-nostr/rx-nostr.ts](../packages/rx-nostr/src/rx-nostr/rx-nostr.ts)
- [packages/rx-nostr/src/legacy/client.ts](../packages/rx-nostr/src/legacy/client.ts)
- [packages/rx-nostr/src/rx-req/rx-req.ts](../packages/rx-nostr/src/rx-req/rx-req.ts)

新規テストは対象機能の既存spec/unit fileに追加し、適切な既存fileがなければ同じ層に作成する。

## 実装内容

1. 各完了通知と所有者を表にし、Promise/Observable/cleanup の発火条件をJSDocに記す。
2. 05で導入した送信通知、11〜14の終了処理を既存のownerへ統合する。多重の完了フラグや同じleaseの二重管理を増やさない。
3. cancel/dispose/retry/AUTH待機/lingerが交差しても一度だけ終了する構造を確認し、実際の問題があれば局所修正する。
4. NostrTransport の行数だけを理由に分割しない。helper移動は責務を明確にする場合に限る。
5. disposeが同期APIでtransportの非同期close完了と同義ではない点も説明する。

## 受入条件

- event / sent / waitFor / stream complete / closed の相互関係が明文化される。
- operationは需要を、executorはprotocolを、transportはconnectionを所有する。
- source dispose と subscription unsubscribe が区別され、既存のforward継続/backward drainを維持する。
- timer/lease/subscriptionの解放経路に重複や抜けがない。

## 検証シナリオ

多重cancel、dispose中のpending署名/AUTH/再接続、linger中のroot disposeを既存contractで検証する。実装を模写するprivate flag検査ではなく、送信が止まる/Promiseが終わる/接続が閉じることで確認する。

最低限の検証コマンド（新しい検査scriptを追加した場合はその実行も含める）:

```sh
pnpm --filter rx-nostr test
pnpm --filter rx-nostr typecheck
```

変更したファイルのformatter/lintも実行する。広範囲の変更ではrootの `pnpm test` / `pnpm build` で全体回帰を確認する。

## 依存関係と担当境界

先行タスク: [05: F05: legacy cast の完了を実際の送信と結び付ける](05-wait-for-legacy-send.md)、[11: F11: Worker verifier の pending request を終了する](11-settle-worker-on-dispose.md)、[12: F12: Worker verifier の timeout を正しい deadline にする](12-enforce-worker-deadline.md)、[13: F13: Worker verifier の処理例外を伝播する](13-propagate-worker-errors.md)、[14: F14: 派生 RxReq の寿命を独立して管理する](14-dispose-derived-rxreq.md)

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
