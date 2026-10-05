# 22 — API設計: EVENT の構造検査と暗号検証を区別する

優先度: **P2**。対応元: **API総合評価**。状態: **未着手**。

## 目的と背景

ensureEventFieldsはpublic type guardでもあるが、tagの要素にobjectでないnumber/boolean等を許し、kind/created_atのfinite性等を十分検査しない。これをstrict Nostr validatorと呼ぶと保証過剰になる。protocol用のFakerは空/短いidやsigを使うので、全層に暗号形式の厳密検査を入れるとprotocolテストの意図と混ざる。

## 主な対象

- [packages/rx-nostr/src/libs/nostr/event.ts](../packages/rx-nostr/src/libs/nostr/event.ts)
- [packages/rx-nostr/src/rx-nostr/communication/transport/nostr-codec.ts](../packages/rx-nostr/src/rx-nostr/communication/transport/nostr-codec.ts)
- [packages/rx-nostr/src/rx-nostr/operation/publish/publication-operation.ts](../packages/rx-nostr/src/rx-nostr/operation/publish/publication-operation.ts)
- [packages/crypto/src/libs/nostr/ensure-event-fields.ts](../packages/crypto/src/libs/nostr/ensure-event-fields.ts)
- [packages/crypto-wasm/src/libs/nostr/ensure-event-fields.ts](../packages/crypto-wasm/src/libs/nostr/ensure-event-fields.ts)
- [packages/rx-nostr/src/utils.ts](../packages/rx-nostr/src/utils.ts)

新規テストは対象機能の既存spec/unit fileに追加し、適切な既存fileがなければ同じ層に作成する。

## 実装内容

1. 最低限の型安全な構造検査、NIP-01形式検査、ID/署名の暗号検証の責務を区別する。
2. public type guardがtrueなら少なくとも宣言したTypeScript型のfieldを満たすよう、tag内の値等を修正する。
3. cryptoのstrictな検証と本体のprotocol parsingの保証を明記する。本体に暗号依存を追加しない。
4. numeric範囲やhex形式をどの層が検査するかを固定し、通常/WASMで同じ実利用結果になるようにする。
5. 既存Fakerを無条件で正当としない一方、protocolテストを暗号テストへ変えず、fixtureの保証を区別する。

## 受入条件

- ensureEventFieldsがNostr.Event型に合わないtags等をtrueと判定しない。
- malformed入力でunhandled例外を起こさず、各層のerror/false契約に従う。
- strict verifierはID/署名/必須構造の不整合を拒否する。
- utility/parser/verifierのそれぞれの保証がJSDocとテストに一致する。

## 検証シナリオ

null、欠落、配列でないtags、tag内number/boolean/null、NaN/Infinity、正しい文字列タグ、正常署名例を分類して検査する。NIP-01一次資料を確認し、単にWASMの現在の挙動を仕様としてコピーしない。

最低限の検証コマンド（新しい検査scriptを追加した場合はその実行も含める）:

```sh
pnpm test
pnpm build
```

変更したファイルのformatter/lintも実行する。広範囲の変更ではrootの `pnpm test` / `pnpm build` で全体回帰を確認する。

## 依存関係と担当境界

先行タスク: [01: F01: EVENT の ID と署名検証の整合性](01-verify-event-id.md)

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
