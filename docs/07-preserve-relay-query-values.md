# 07 — F07: relay URL の query 値を保持する

優先度: **P2**。対応元: **F07**。状態: **未着手**。

## 目的と背景

normalizeRelayUrl は searchParams.sort 後の query 全体を decodeURIComponent し URL.search へ戻す。wss://relay.example?token=a%26b%3Dc が ?token=a&b=c になり、token 値一つが token と b の二つへ変わる。この関数は単なる utility ではなく relay の重複排除、Directory、接続先全体に使われる。

## 主な対象

- [packages/rx-nostr/src/libs/relay-urls.ts](../packages/rx-nostr/src/libs/relay-urls.ts)
- [packages/rx-nostr/src/libs/relay-urls.test.ts](../packages/rx-nostr/src/libs/relay-urls.test.ts)
- [packages/rx-nostr/src/rx-relays/rx-relays.ts](../packages/rx-nostr/src/rx-relays/rx-relays.ts)
- [packages/rx-nostr/src/relay-directory/relay-directory.ts](../packages/rx-nostr/src/relay-directory/relay-directory.ts)

新規テストは対象機能の既存spec/unit fileに追加し、適切な既存fileがなければ同じ層に作成する。

## 実装内容

1. query 値の予約文字を構文へ変換しない正規化に変更する。
2. host の大小、末尾 slash/dot、fragment 除去、query の順序、invalid URL 除外の既存意図を確認し保持する。
3. 同名 query の相対順と、エンコードされた + と literal + の意味を保持する。
4. URL が異なる意味を持つ場合は RelayMap/RelaySet で一つに潰さない。

## 受入条件

- 再現例の token 値 "a&b=c" が正規化後も維持される。
- 正規化が冪等で、等価 alias の既存テストも通る。
- 機密 token の異なる URL が同一 relay として混同されない。
- 不正な percent encoding でも予期しない例外を漏らさない。

## 検証シナリオ

&, =, +, %, Unicode、空値、同名複数値、二重エンコードを表形式にし、URL.searchParams の key/value と同名順序を検査する。異なる key の sort は既存契約なので、生の query 文字列の完全一致だけを要件にしない。

最低限の検証コマンド（新しい検査scriptを追加した場合はその実行も含める）:

```sh
pnpm --filter rx-nostr test:unit src/libs/relay-urls.test.ts src/rx-relays/rx-relays.test.ts
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
