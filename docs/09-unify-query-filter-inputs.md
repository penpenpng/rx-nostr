# 09 — F09: static と emitted filter の意味を統一する

優先度: **P2**。対応元: **F09**。状態: **未着手**。

## 目的と背景

static readonly LazyFilter[] はそのまま使うが RxReq.emit は normalizeFilters を通る。emit({authors:[]}) は制約が削除され [{}] になる。static の同じ空配列は残り matching では一致しない。since > until や無効 field の扱いにも経路差がある。NIP-01 はリストに値があることを前提とするが、制約を消して全件化する仕様ではない。

## 主な対象

- [packages/rx-nostr/src/rx-nostr/rx-nostr.ts](../packages/rx-nostr/src/rx-nostr/rx-nostr.ts)
- [packages/rx-nostr/src/rx-req/rx-req.ts](../packages/rx-nostr/src/rx-req/rx-req.ts)
- [packages/rx-nostr/src/rx-req/normalize-filters.ts](../packages/rx-nostr/src/rx-req/normalize-filters.ts)
- [packages/rx-nostr/src/lazy-filter/lazy-filter.ts](../packages/rx-nostr/src/lazy-filter/lazy-filter.ts)
- [packages/rx-nostr/src/**test**/specs/query.spec.ts](../packages/rx-nostr/src/__test__/specs/query.spec.ts)

新規テストは対象機能の既存spec/unit fileに追加し、適切な既存fileがなければ同じ層に作成する。

## 実装内容

1. 入力分類表を先に作り、省略 field、空 filter 配列、空条件配列、逆転時刻、不正 field、lazy 境界の処理を決める。
2. 不正/空条件が暗黙の全件検索へ拡大しない方針を採用する。推奨は満たせない filter を空結果として扱うか明示的に拒否することであり、実装時に docs/既存利用との整合を説明する。
3. static と emitted を同一の境界処理へ通す。RxReq.pipe が生成する packet も考慮する。
4. lazy 関数を早期評価せず、実評価後の矛盾も扱う。空 filter list と [{}] は意味を区別する。
5. 終了・エラーのチャネルと入力 mutation の扱いを文書化する。

## 受入条件

- 同じ filter は static / emitted / piped で同じ wire、matching、終了結果を持つ。
- authors:[] / kinds:[] / ids:[] / tag:[] が全件検索へ変わらない。
- 複数 filter の OR、limit:0、空宛先、lazy 再送の契約を維持する。
- 不正入力で接続需要や queued segment が残らない。
- 選んだ invalid-input 方針が JSDoc と docs、回帰テストに記録される。

## 検証シナリオ

制御 socket と同じ入力表を二つの入力形式へ適用する。F08 の 0 を維持する。根拠は https://github.com/nostr-protocol/nips/blob/master/01.md#from-client-to-relay-sending-events-and-creating-subscriptions 。設計の横断整理は19、境界表の拡充は28。

最低限の検証コマンド（新しい検査scriptを追加した場合はその実行も含める）:

```sh
pnpm --filter rx-nostr test:unit src/rx-req
pnpm --filter rx-nostr test:contract src/__test__/specs/query.spec.ts
pnpm --filter rx-nostr typecheck
```

変更したファイルのformatter/lintも実行する。広範囲の変更ではrootの `pnpm test` / `pnpm build` で全体回帰を確認する。

## 依存関係と担当境界

先行タスク: [08: F08: filter の 0 の時刻境界を保持する](08-preserve-zero-time-bounds.md)

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
