# Task 11: Package、contract test、release readiness

## 目的

repository 内で動くだけでなく、配布 artifact を利用者環境から安全に import・実行できる状態にする。

## 作業

- Task 10 で正式化した `src`/build entry を監査し、残存 v3 files、`next/` path、direct WebSocket files が artifact と public declaration に含まれないことを確認する。
- package version、exports、types、files、sideEffects、engines、dependencies/peerDependencies を v4 の最終配布契約として監査する。
- unipls submodule/workspace development と npm published dependency の両方で解決が再現できる構成にする。
- packed tarball を一時 consumer project へ install し、root import、types、Node runtime、deep import rejection を検証する。
- D8 の Node/Deno/Bun/browser matrix を CI に置く。WebSocket constructor/global の両経路を検証する。
- public contract `*.spec.ts` は internal module を import していないことを監査する。
- resource leak scenarios（timer、listener、socket、retry action、Observable subscription）を監査する。
- v4 user docs と v3 -> v4 migration guide を `packages/docs` に追加する。
- v3 feature matrix の keep/replace/remove/defer が docs と実装で一致するか最終監査する。
- changelog/release notes に breaking changes、runtime floor、unipls dependency、hot relays/RxRelays/RelayDirectory を記載する。

## release gate

- clean checkout/submodule initialization から pnpm install が再現できる。
- lint、format check、typecheck、unit tests、contract tests、package tests、docs build がすべて成功する。
- build/declaration diagnostics が 0 で、失敗時は process が非 0。
- tarball に test、dev docs、submodule source、古い v3 source が誤って含まれない。
- public `.d.ts` に private path、`next/` path、unipls internal path が漏れない。
- support matrix の各 runtime で minimal REQ/publish/dispose smoke test が通る。
- migration guide の code examples が typechecked される。
- unresolved required decision/TODO/`Not implemented` が public execution path にない。

## 完了時の記録

- 実行した release commands と version
- artifact file list と size
- behavior matrix の最終状態
- deferred items（multiplexing、query splitting 等）の follow-up issue/task
- unipls 側へ相談・変更した事項があればその version/commit と互換範囲
