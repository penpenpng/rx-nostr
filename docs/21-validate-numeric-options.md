# 21 — API設計: timeout と linger の数値契約を揃える

優先度: **P2**。対応元: **API総合評価**。状態: **未着手**。

## 目的と背景

connectionTimeoutはpositive finiteかつtimer上限以下で検査されるが、REQ/publish timeoutやlingerでは非finiteを無期限として扱う箇所がある。NaNや-InfinityまでInfinityと同じ意味になり得る。F12修正後のWorker timeoutとも方針を合わせる必要がある。0の意味はoptionごとに異なり、すべて一律positiveにしてはいけない。

## 主な対象

- [packages/rx-nostr/src/rx-nostr/rx-nostr.config.ts](../packages/rx-nostr/src/rx-nostr/rx-nostr.config.ts)
- [packages/rx-nostr/src/rx-nostr/operation/req/options.ts](../packages/rx-nostr/src/rx-nostr/operation/req/options.ts)
- [packages/rx-nostr/src/rx-nostr/operation/publish/options.ts](../packages/rx-nostr/src/rx-nostr/operation/publish/options.ts)
- [packages/rx-nostr/src/rx-nostr/operation/demand/connection-demand-scope.ts](../packages/rx-nostr/src/rx-nostr/operation/demand/connection-demand-scope.ts)
- [packages/rx-nostr/src/authenticator/simple-authenticator.ts](../packages/rx-nostr/src/authenticator/simple-authenticator.ts)
- [packages/rx-nostr/src/event-verifier/worker-verifier.ts](../packages/rx-nostr/src/event-verifier/worker-verifier.ts)
- [packages/rx-nostr/src/relay-directory/relay.ts](../packages/rx-nostr/src/relay-directory/relay.ts)

新規テストは対象機能の既存spec/unit fileに追加し、適切な既存fileがなければ同じ層に作成する。

## 実装内容

1. connectionTimeout、nip11Timeout、REQ/publish timeout、authTimeout、worker timeout、linger、retry/health期限の許容表を作る。
2. 既存の正当な0/Infinityを維持し、NaN/-Infinity/不正負数を明示的に拒否する。timer上限超過は意図せず1msへ丸まらない方針にする。
3. constructor/static defaults/instance options/packet lingerの各入力を、利用される境界で一貫して検査する。
4. 設定の型と検査は所属層に置く。helper共通化は同一の数値契約の範囲に留める。
5. 同期throw/Observable error/Promise rejectのチャネルをdocsに示す。互換影響が大きい選択はユーザーに確認する。

## 受入条件

- 各optionの0/正数/Infinity/NaN/負数/上限超過の挙動が明確。
- NaNが無期限のresource保持にならない。
- invalid optionでtimer/接続/署名を不要に開始しない。
- built-in defaults、明示0、valid Infinityの既存シナリオが通る。

## 検証シナリオ

table-driven境界テストとpublic constructor/query/publish/emitを通る代表例を追加する。極端に大きい実時間を待たずfake timerを使う。

最低限の検証コマンド（新しい検査scriptを追加した場合はその実行も含める）:

```sh
pnpm --filter rx-nostr test
pnpm --filter rx-nostr typecheck
pnpm docs:build
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
