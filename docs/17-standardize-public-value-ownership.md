# 17 — 内部設計: 公開値と内部状態の所有権を統一する

優先度: **P2**。対応元: **設計改善1**。状態: **未着手**。

## 目的と背景

Directory、connection state、Publication.event は copy を返すが、OK は共有参照だった。F02 の局所修正後にも、公開 mutable 値と内部 snapshot の境界を各層で同じ原則にする必要がある。RxRelays の observable が返す Set、diagnostic context、failure の cause なども独自の所有権を持つ。何でも deep clone する設計は class instance、Error、function を壊す。

## 主な対象

- [packages/rx-nostr/src/rx-nostr/operation/publish/publication-operation.ts](../packages/rx-nostr/src/rx-nostr/operation/publish/publication-operation.ts)
- [packages/rx-nostr/src/rx-nostr/rx-nostr.ts](../packages/rx-nostr/src/rx-nostr/rx-nostr.ts)
- [packages/rx-nostr/src/relay-directory/relay-directory.ts](../packages/rx-nostr/src/relay-directory/relay-directory.ts)
- [packages/rx-nostr/src/rx-relays/rx-relays.ts](../packages/rx-nostr/src/rx-relays/rx-relays.ts)
- [packages/rx-nostr/src/libs/error.ts](../packages/rx-nostr/src/libs/error.ts)
- [packages/rx-nostr/src/connection-state.ts](../packages/rx-nostr/src/connection-state.ts)

新規テストは対象機能の既存spec/unit fileに追加し、適切な既存fileがなければ同じ層に作成する。

## 実装内容

1. 公開出力ごとに内部 snapshot / observer ごとの copy / 同じ Promise が返す単一 copy / opaque cause の分類表を作る。
2. 内部判定や他 observer を変え得る共有があれば型に応じた copy を境界へ置く。Promise.event は一つの Promise なので await ごとの新 copy は保証しない。
3. clone helper が必要な場合はデータの所属層へ置く。汎用 JSON clone や全 object freeze に依存しない。
4. callback に渡す config/health snapshot、public error.failures、RxRelays Set を確認する。
5. code comment/JSDoc と日本語 docs に実際の保証を書く。

## 受入条件

- 内部の成否判定と接続状態が公開データの変更から隔離される。
- 保証する observer 間の独立性がネストした配列/Set にも成立する。
- Error cause やユーザー注入 object の参照扱いを明記する。
- copy 箇所の責務が明確で、意味のない複製を多層で重ねない。

## 検証シナリオ

F02 のテストを再利用し、Directory/connection state/RxRelays の二人の observer が片方の値を書き換えるケースを追加する。共有してよい opaque cause の identity は不必要に変更しない。

最低限の検証コマンド（新しい検査scriptを追加した場合はその実行も含める）:

```sh
pnpm --filter rx-nostr test
pnpm --filter rx-nostr typecheck
```

変更したファイルのformatter/lintも実行する。広範囲の変更ではrootの `pnpm test` / `pnpm build` で全体回帰を確認する。

## 依存関係と担当境界

先行タスク: [02: F02: OK 通知を内部の成功判定から分離する](02-isolate-publication-ok.md)

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
