# Task 00: Baseline と contract matrix

## 目的

壊れた build gate と v3/v4 混在を整理し、以降の変更を判定できる最小の品質基盤を作る。機能実装は行わない。

## 作業

- `main` の v3 public API、v3 docs、`next/index.ts`、既存 v4 tests から behavior matrix を作る。
- 各 v3 behavior を `keep`、`replace`、`remove`、`defer` のいずれかへ分類し、理由と対応 task を記録する。
- `tsconfig` の v4 typecheck 対象を `next` に限定し、欠落した v3 `src` が v4 gate を汚さないようにする。
- Vite build と declaration generation の診断を確実に exit code へ反映する独立 `typecheck` script を作る。
- `*.spec.ts` と `*.test.ts` の配置・import rule を runner config に反映する。
- unipls の controlled WebSocket/test support を rx-nostr test から使う方針を確立する。submodule 内部への deep import に依存せず、必要なら rx-nostr 側に protocol fixture を置く。
- runtime support と TypeScript target を D8 に合わせる。新しい Set methods への依存を support matrix で確認する。

## 成果物

- behavior matrix（この docs 以下）
- `typecheck`, `test:contract`, `test:unit` など信頼できる scripts
- 空でも public entry point を経由する contract test project
- 現在の TypeScript error を module/task 別に分類した baseline

## 受入条件

- 意図的な未実装 error が残っていても、typecheck はそれを見逃さず非 0 になる。
- build が型診断を表示しながら成功扱いになる状態を解消する。
- v3 source の欠落は v4 typecheck の error に含まれない。
- 既存 19 tests の意味を変えずに維持し、分類だけ必要に応じて変更する。
- direct WebSocket の残骸が後続 Task 02 の削除対象として列挙される。

## 非目標

- 未完成 module の型 error を dummy 実装で隠すこと
- v3 compatibility layer の実装
- unipls submodule の変更
