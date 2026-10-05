# 20 — 内部設計: RelayDirectory の拡張可能性を明確にする

優先度: **P2**。対応元: **設計改善4**。状態: **未着手**。

## 目的と背景

IRelayDirectoryを公開するがRxNostrConfigはconcrete RelayDirectoryを要求し、内部reporterはWeakMapで登録したinstanceしか認識しない。public readerと内部health writerを分ける意図は妥当だが、構造的な独自Directoryの注入能力はない。docsの「injectable」はinstanceの差し替えと独自実装注入を区別すべきである。

## 主な対象

- [packages/rx-nostr/src/relay-directory/relay-directory.interface.ts](../packages/rx-nostr/src/relay-directory/relay-directory.interface.ts)
- [packages/rx-nostr/src/relay-directory/relay-directory.ts](../packages/rx-nostr/src/relay-directory/relay-directory.ts)
- [packages/rx-nostr/src/rx-nostr/rx-nostr.interface.ts](../packages/rx-nostr/src/rx-nostr/rx-nostr.interface.ts)
- [packages/rx-nostr/src/rx-nostr/communication/relay-directory-bridge.ts](../packages/rx-nostr/src/rx-nostr/communication/relay-directory-bridge.ts)
- [packages/docs/ja/v4/relay-directory.md](../packages/docs/ja/v4/relay-directory.md)

新規テストは対象機能の既存spec/unit fileに追加し、適切な既存fileがなければ同じ層に作成する。

## 実装内容

1. 現行の拡張点（clock/fetcher、別instance、subclassの可否）と非対応な構造的実装を明示する。
2. 最小方針はconcrete Directoryのまま型/JSDoc/docsを正確にし、不要なpublic health mutation能力を公開しないこと。
3. public interfaceがどのconsumer向けなのかを説明する。独自実装injectionを新たに提供する必要があるなら、互換性・所有権・probe調整を具体化してユーザー判断を求める。
4. bridge内部のreader/reporterの分離を保ち、例外がoperation開始後に曖昧に出るような型の偽装をしない。

## 受入条件

- 利用者が何を注入できるかを型とdocsから同じように理解できる。
- health reporterは内部に保ち、任意の外部操作でshared probeが壊れない。
- 独立Directoryと共有Directoryの既存health/metadata挙動を維持する。
- 設計選択と独自実装を受けない理由、またはport契約を記録する。

## 検証シナリオ

clock/fetcher注入、二instanceでの共有health、snapshot、probeの既存テストを通す。型の説明だけの変更なら意味のないruntimeテストは追加しない。

最低限の検証コマンド（新しい検査scriptを追加した場合はその実行も含める）:

```sh
pnpm --filter rx-nostr test:unit src/relay-directory src/rx-nostr/communication/relay-directory-bridge.test.ts
pnpm --filter rx-nostr typecheck
pnpm docs:build
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
