# Task 10: Source、workspace、依存関係、release 管理の整理

## 目的

Task 11 の配布・release 監査へ入る前に、v4 の正式な source layout、回帰契約、workspace package manager、依存関係、release note 管理を整理する。

## 作業

- `packages/rx-nostr/src` に残る v3 implementation を破棄し、`packages/rx-nostr/next` の v4 implementation を `packages/rx-nostr/src` へ移す。
- source、test、tsconfig、Vite、lint、package entry、docs 内の `next/` 前提を正式な `src/` 前提へ更新する。
- v3 時点の全 test を確認し、v4 でも維持すべき利用者契約を behavior matrix と照合して、既存の v4 test で担保されていない契約を追加する。
- v3 の test case を機械的に移植しない。論理接続維持のための具体的な再接続挙動は v4 で変更されている可能性があるため、v4 の architecture と public contract に従って scenario を再構成する。一方、各設定項目が宣言する契約は、同等の public contract test または必要な unit test で保証する。
- npm workspace を廃止し、repository を pnpm workspace へ移行する。workspace 定義、lockfile、root/package scripts、CI、開発文書を pnpm に統一する。
- pnpm workspace の minimum release age 機能を有効にし、採用する期間と例外方針を repository 内に明記する。
- runtime、build、test、lint、release tooling を含む依存ライブラリを更新し、不要または重複した依存を除去する。
- `nostr-typedef` を通常の runtime dependency から peer dependency へ変更し、package 自身の build/test に必要な宣言方法と、利用者に要求する対応 version range を明確にする。
- release-drafter の config、workflow、運用前提を除去し、Changesets を導入する。changeset 作成、version 更新、changelog 生成、publish の scripts/CI と開発者向け手順を整える。

## v3 test 監査の記録

- v3 test file/scenario ごとに、`keep`、`replace`、`remove`、`defer`、または既存 v4 test で担保済みのいずれかを記録する。
- `keep`/`replace` と判断した契約には、対応する v4 test の file または追加 task を紐づける。
- reconnect、connection strategy、default relay など v4 で概念が分割・置換された領域は、旧内部挙動ではなく、設定値から観測可能な接続需要、再送、終了、cleanup の契約を検証する。
- `remove`/`defer` は [behavior matrix](../behavior-matrix.md) と矛盾しないことを確認し、黙って回帰 test を削除しない。

## 受入条件

- v4 production source と test の正式な配置が `packages/rx-nostr/src` になり、`packages/rx-nostr/next` と旧 v3 source が残っていない。
- build artifact、public declaration、source import、test alias に `next/` path が現れない。
- v3 test の全件監査結果が記録され、維持・置換対象で未検証の public contract が残っていない。
- v4 で変更された reconnect implementation の詳細に test を固定せず、`defer`、`weak`、`linger`、hot relay、retry policy など各設定が宣言する観測可能な契約を検証している。
- clean checkout から pnpm だけで install と workspace scripts を実行でき、npm workspace と `package-lock.json` に依存しない。
- minimum release age の値と例外が設定・文書化され、通常 install でその policy が有効になることを検証している。
- dependency update 後に duplicate、deprecated、unresolved peer dependency がなく、採用した runtime matrix を引き上げる変更は明記されている。
- packed package が `nostr-typedef` を peer dependency として宣言し、対応 version の consumer で typecheck/build できる。
- release-drafter の active config/workflow が残らず、Changesets による changeset check、versioning、changelog、publish の流れが再現できる。
- format、lint、typecheck、unit tests、public contract tests、build が pnpm 経由で成功する。

## 非目標

- Task 11 が担当する runtime matrix 全 lane、packed artifact、docs build、release note 内容の最終監査
- behavior matrix で deferred とした一 relay の多重接続と query splitting の実装
- v3 compatibility alias の復活

## 完了時の記録

- source 移行で削除・移動した file と entry point
- v3 test の全件監査表と、追加・置換した v4 test
- pnpm version、minimum release age、例外設定、lockfile migration の結果
- 更新した依存と breaking/runtime impact
- `nostr-typedef` の peer range と consumer verification
- Changesets の運用手順と、削除した release-drafter resources
