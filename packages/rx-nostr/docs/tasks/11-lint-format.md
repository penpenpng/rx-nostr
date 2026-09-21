# Task 11: Linter、formatter、静的品質ゲートの再設計

## 目的

TypeScript 7 と pnpm workspace を前提に、repository 全体の linter、formatter、import rule、静的品質ゲートを再選定する。

## 作業

- TypeScript 7 を正式にサポートする linter と TypeScript integration を選定する。
- formatter と format check/write の実行方法を選定し、source、test、config、Markdown、JSON、YAML の対象範囲を固定する。
- public contract spec が package entry point だけを import する規則、未使用 code、unsafe cast、import boundary など既存の重要な lint rule を移植または置換する。
- root と各 package の scripts を pnpm workspace 向けに統一する。
- local development、CI、Changesets release workflow に lint/format check を戻す。
- tool configuration と依存関係を一箇所に集約し、package ごとの不要な重複を避ける。

## 受入条件

- TypeScript 7 の型検査と競合せず、repository 全体の lint と format check が成功する。
- lint/format failure が CI と release workflow を非 0 で停止する。
- public contract import boundary と production code の direct WebSocket prohibition が自動検査される。
- `pnpm lint`、`pnpm lint:fix`、`pnpm format`、`pnpm format:check` の責務が明確で再現可能である。
- tool の選定理由、対象 file、除外 file、editor integration を開発文書に記録する。

## 非目標

- production API または runtime behavior の変更
- Task 12 が担当する packed artifact と runtime matrix の最終監査
