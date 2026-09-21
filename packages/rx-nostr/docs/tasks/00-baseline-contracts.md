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

## 実施結果

- Status: **completed at 2026-09-21**
- v3/v4 の対応を [behavior matrix](../behavior-matrix.md) に分類した。
- production の対象を `next` に限定し、tests も検査する `tsconfig.check.json` を追加した。
- unit (`*.test.ts`) と public contract (`next/__test__/contract/**/*.spec.ts`) を Vitest project として分離した。
- contract spec から production code を parent-relative import しない lint rule と、package entry point `rx-nostr` の test alias を追加した。
- declaration diagnostics を Vite の失敗へ反映し、独立 typecheck を build の前段に置いた。
- 現在の診断、direct WebSocket 残骸、controlled transport 方針、runtime 注意点を [typecheck baseline](../typecheck-baseline.md) に記録した。

検証結果:

- `npm run test:unit -w packages/rx-nostr`: 5 files / 19 tests passed
- `npm run test:contract -w packages/rx-nostr`: 1 file / 1 test passed
- `npm test -w packages/rx-nostr`: 6 files / 20 tests passed
- `npm run lint -w packages/rx-nostr`: passed
- `npm run typecheck -w packages/rx-nostr`: expected failure (exit 2, 38 known v4 diagnostics)
- `npm run build -w packages/rx-nostr`: expected failure (exit 2 at typecheck)
- direct `vite build`: expected failure (exit 1 at declaration diagnostics)
