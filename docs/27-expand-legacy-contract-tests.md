# 27 — テスト拡充: legacy facade の互換契約

優先度: **P2**。対応元: **legacyテスト**。状態: **未着手**。

## 目的と背景

legacy.specはreadable default relayへuseを流す1ケースのみだった。公開entryにはsend/cast、read/write、additional relay、timeout、retry、connectionState等があり、テストの保証範囲よりAPIが広い。v3-shaped facadeであり完全なv3互換とは限らないため、型と文書にある約束を検査する。

## 主な対象

- [packages/rx-nostr/src/**test**/specs/legacy.spec.ts](../packages/rx-nostr/src/__test__/specs/legacy.spec.ts)
- [packages/rx-nostr/src/legacy/client.ts](../packages/rx-nostr/src/legacy/client.ts)
- [packages/rx-nostr/src/legacy/types.ts](../packages/rx-nostr/src/legacy/types.ts)
- [packages/rx-nostr/src/legacy/reconnector.ts](../packages/rx-nostr/src/legacy/reconnector.ts)
- [packages/docs/ja/v4/migration-guide.md](../packages/docs/ja/v4/migration-guide.md)

新規テストは対象機能の既存spec/unit fileに追加し、適切な既存fileがなければ同じ層に作成する。

## 実装内容

1. 型の各method/optionを列挙し、互換範囲を明確にしたシナリオ表を作る。
2. read-only/write-only/default/additional/explicit relayと正規化を検査する。LegacyRelayInputのIterable（Set/generator）も実際に扱えるか確認する。
3. sendのall-ok/any-ok/sent、cast、timeout/errorOnTimeout、empty relay、signer例外を検査する。
4. AUTH object/class/factory、retry指定、lazy/lazy-keep/aggressive、disposalを検査する。
5. useをsubscribeしない場合、複数回subscribe、片方unsubscribe、動的relay更新でderived集合を誤共有/解放しないか確認する。

## 受入条件

- 約束したlegacy機能が公開methodからprotocol出力まで検証される。
- 05/06の回帰を含み、未送信を成功扱いしない。
- iterable/permission/optionの型にある経路を黙って捨てない。
- 見つかった仕様不一致は互換判断を記録し、重大な選択ならユーザーへ確認する。

## 検証シナリオ

実リレーなしでcontrolled socketとdeferred signerを使う。runtimeのexports検査は24に任せるが、内部関数を直接呼ぶだけのテストでpublic facade検査を代用しない。

最低限の検証コマンド（新しい検査scriptを追加した場合はその実行も含める）:

```sh
pnpm --filter rx-nostr test:contract src/__test__/specs/legacy.spec.ts
pnpm --filter rx-nostr typecheck
```

変更したファイルのformatter/lintも実行する。広範囲の変更ではrootの `pnpm test` / `pnpm build` で全体回帰を確認する。

## 依存関係と担当境界

先行タスク: [05: F05: legacy cast の完了を実際の送信と結び付ける](05-wait-for-legacy-send.md)、[06: F06: legacy AUTH adapter の委譲を修正する](06-preserve-authenticator-methods.md)、[18: 内部設計: 操作の完了とリソース解放の責務を整理する](18-clarify-operation-lifecycle.md)

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
