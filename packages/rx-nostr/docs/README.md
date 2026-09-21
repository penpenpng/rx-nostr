# rx-nostr v4 開発資料

このディレクトリは、破壊的変更を伴う rx-nostr v4 の実装を継続するための開発者向け資料です。ライブラリ利用者向けの v3 ドキュメントは `packages/docs` にあり、ここでは扱いません。

## 読む順序

1. [current-state.md](./current-state.md): 調査時点の実装状況と既知の欠落
2. [architecture.md](./architecture.md): v4 の責務分割、用語、守るべき不変条件
3. [decisions.md](./decisions.md): 実装前に利用者の判断が必要な事項
4. [tasks.md](./tasks.md): 実装タスクの依存順と進捗一覧
5. [behavior-matrix.md](./behavior-matrix.md): v3 の能力を v4 で維持・置換・廃止・延期する一覧
6. [typecheck-baseline.md](./typecheck-baseline.md): Task 00 時点の型エラー分類
7. [public-contract.md](./public-contract.md): Task 01 で固定した公開型・operation・error の契約
8. [v3-test-audit.md](./v3-test-audit.md): Task 10 で実施した v3 test 契約の全件監査

## この資料の扱い

- 調査基準は 2026-09-21、rx-nostr の `v4` ブランチ `94af242`、unipls submodule の `main` `3c90360` です。
- v3 の完全なコードは作業ツリーの `src` ではなく、`git show main:packages/rx-nostr/...` で確認しました。
- `next` のうち `rx-req`、`rx-relays`、`event-signer`、`event-verifier`、`lazy-filter`、`operators` は、明確な欠陥または統合上の不足が見つからない限り公開契約を維持します。
- [decisions.md](./decisions.md) の必須項目が未決定の間は、その判断に依存するタスクを開始しません。
- 実装中に unipls の変更が必要だと判明した場合は、変更に着手する前に根拠と代替案を利用者へ提示します。
- タスク完了時には、該当タスク文書のチェックリスト、実装との差異、追加で生じた判断事項を更新します。
