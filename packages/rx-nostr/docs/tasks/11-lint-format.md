# Task 11: Linter、formatter、静的品質ゲートの再設計

## 目的

TypeScript 6 と pnpm workspace を前提に、Vite+ へ library build、linter、formatter を集約し、repository 全体の静的品質ゲートを再構築する。

## 作業

- Vite+ が安定した Compiler API として扱える TypeScript version を選定する。
- formatter と format check/write の実行方法を選定し、source、test、config、Markdown、JSON、YAML の対象範囲を固定する。
- project 固有 rule/plugin は初期移行へ含めず、Oxlint と Oxfmt の推奨 default を採用する。
- rx-nostr と crypto の library build と declaration generation を `vp pack` へ移し、test source を含まない配布可能な artifact を生成する。
- root と各 package の scripts を pnpm workspace 向けに統一する。
- local development、CI、Changesets release workflow に lint/format check を戻す。
- tool configuration と依存関係を一箇所に集約し、package ごとの不要な重複を避ける。

## 受入条件

- TypeScript 6 の型検査と競合せず、repository 全体の lint と format check が成功する。
- lint/format failure が CI と release workflow を非 0 で停止する。
- `pnpm lint`、`pnpm lint:fix`、`pnpm format`、`pnpm format:check` の責務が明確で再現可能である。
- rx-nostr と crypto の build が単一の JavaScript entry、型宣言、各 source map を生成し、test/spec/helper を `dist` と packed package に含めない。
- tool の選定理由、対象 file、除外 file、editor integration を開発文書に記録する。

## 非目標

- production API または runtime behavior の変更
- custom Oxlint plugin と repository 固有 lint rule の導入
- Vitest 5 から Vite+ bundled Vitest 4 への移行
- Task 12 が担当する packed artifact と runtime matrix の最終監査

## 実装結果

2026-09-22 に完了。

- Vite+ 0.3.3 を root dev dependency として導入し、TypeScript はpnpm catalogで、Vite+ の declaration generator が安定 API として扱える 6.0.2 に統一した。TypeScript 7 と互換 layer の `@typescript/typescript6` はlockfileからも除去した。
- root `vite.config.ts` に Oxlint/Oxfmt 設定を集約した。rule と書式 option は default を採用し、生成物、dependency、`pnpm-lock.yaml`、`packages/docs`、別 repository である unipls submoduleを除外した。
- `pnpm lint` は検査、`pnpm lint:fix` は安全な自動修正、`pnpm format` は書き込み、`pnpm format:check` は差分検査を担当する。`pnpm check` は Vite+ の lint/format composite gate とする。
- rx-nostr と crypto の build を `vp pack` へ移し、ES2022/neutral ESM、external dependencies、clean output、JavaScript/declaration source map を設定した。各 build は `index.js`、`index.js.map`、`index.d.ts`、`index.d.ts.map` の4ファイルだけを生成する。
- Vitest 5 は package ごとの `vitest.config.ts` に分離して維持した。Vite+ が推奨する workspace 全体の Vite/Vitest override は、crypto-wasm と unipls の toolchainを変更するため導入していない。
- Vite+ bundled Vitestのoptional browser peerが既存のnode-mode Vitestへ影響しないことを前提に、共存させるversionだけを`pnpm-workspace.yaml`の`peerDependencyRules.allowedVersions`へ明記した。browser modeはこのrepositoryでは使用しない。
- package の export を新しい `dist/index.js` と `dist/index.d.ts` に合わせ、crypto にも test/spec の publish 除外を追加した。
- CI と Changesets release workflow に format check と lint を追加した。
- editor では Vite Plus Extension Pack または Oxc extensionを使用し、repository rootの `vite.config.ts` を設定源とする。nested Oxlint/Oxfmt config は追加しない。

対象は `packages/docs` と submodule を除く tracked source、test、JavaScript/TypeScript config、Markdown、JSON、YAML、TOML とする。lockfile は package manager が管理するため formatter 対象外とする。
