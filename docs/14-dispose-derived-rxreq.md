# 14 — F14: 派生 RxReq の寿命を独立して管理する

優先度: **P2**。対応元: **F14**。状態: **未着手**。

## 目的と背景

RxReq.pipe は new RxReq() 後、その stream を親 Subject に置き換える。stack に登録された Subject は置き換え前のものなので派生 dispose は実際の stream を止めない。piped.dispose(); source.emit(...) 後にも派生 observer に next が届く。親 source の共有は意図された機能なので、修正で親や兄弟を停止してはいけない。

## 主な対象

- [packages/rx-nostr/src/rx-req/rx-req.ts](../packages/rx-nostr/src/rx-req/rx-req.ts)
- [packages/rx-nostr/src/rx-req/rx-req.test.ts](../packages/rx-nostr/src/rx-req/rx-req.test.ts)
- [packages/rx-nostr/src/libs/rxjs/pipeable.ts](../packages/rx-nostr/src/libs/rxjs/pipeable.ts)
- [packages/rx-nostr/src/libs/rxjs/rx-disposable-stack.ts](../packages/rx-nostr/src/libs/rxjs/rx-disposable-stack.ts)
- [packages/rx-nostr/src/**test**/specs/query.spec.ts](../packages/rx-nostr/src/__test__/specs/query.spec.ts)

新規テストは対象機能の既存spec/unit fileに追加し、適切な既存fileがなければ同じ層に作成する。

## 実装内容

1. 親 source と派生 view の所有権を分ける。派生自身の停止通知と operator chain の teardown を結び付ける。
2. 原則として現在の RxReq / pipe の型を保ち、派生 dispose はその派生だけを終了させる。
3. 親 dispose の伝播、派生 emit の可否、dispose 後の subscribe/emit の契約を明示する。未破棄時の pipe.emit が使う共有 source の既存挙動を不用意に変えない。
4. timer を持つ operator で dispose 後に buffer が出力されないよう、単なる source complete と強制 teardown の位置を検討する。
5. forward query の最後の segment が source completion 後も続く契約と、派生 source の停止を混同しない。

## 受入条件

- 派生 dispose 後に派生 observer へ next が届かず complete する。
- 親と兄弟は動作を継続できる。
- 親 dispose が子へ伝播し、派生多段 chain も正しく終了する。
- operator timer、subscription、無用な Subject が残らない。
- RxReq subclass と pipe 型推論、query の source completion 契約を維持する。

## 検証シナリオ

source、二つの派生、複数 subscriber、bufferTime 等の operator を組み合わせて negative assertion を行う。親/派生/購読のどれを dispose/unsubscribe したかを明示する。全寿命シナリオの拡充は31。

最低限の検証コマンド（新しい検査scriptを追加した場合はその実行も含める）:

```sh
pnpm --filter rx-nostr test:unit src/rx-req
pnpm --filter rx-nostr test:contract src/__test__/specs/query.spec.ts
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
