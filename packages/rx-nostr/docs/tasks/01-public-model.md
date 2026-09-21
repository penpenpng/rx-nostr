# Task 01: Public model と config の固定

## 目的

通信実装より先に、v4 の public naming、packet、option、error semantics を contract test 可能な形へ固定する。

## 作業

- D1/D5/D9/D10/D13/D14 を反映し `IRxNostr`、`RxNostrConfig`、REQ/publish options を整理する。
- `RelayInput` を共通 types module へ移し、`RxRelays | Iterable<string> | string` の normalization contract を固定する。
- `ConnectionState` と packet type を unipls の内部型から独立した discriminated union/snapshot として設計する。
- D6 の publication operation object、OK subscription、cancel、all/any Promise、signed EVENT snapshot の public model を設計する（実装は Task 08）。
- `traceId`/`traceTag`、`raw`/`message`、`from`/`relay` の不整合を解消する。query result では `traceTag` だけを correlation value として公開し、`subId`/`vreqId` とそれらを含む raw tuple を露出させない。
- invalid relay、disposed instance、missing signer/verifier、callback error の分類を決める。
- stable と指定された module の public signature は、明確な型欠陥だけを最小修正する。例: `RelayUrl` の `ws://${number}` は通常の ws hostname を表現できないため修正候補。
- `next/index.ts` の intended exports を API type fixture で固定する。未完成 class を完成 API として誤って export しない。

## 契約として記録する事項

- Observable が cold か hot か、operation を開始する時点
- per-operation option と root default の優先順位
- empty/invalid relay input の挙動
- one-shot filter が backward strategy になること
- verifier/filter/expiration pipeline の順序と失敗時の挙動
- query result が利用者指定 `traceTag` を保持し、physical/logical internal ID を公開しないこと
- publication を開始する時点、all/any Promise の resolve value と error、cancel/timeout/drop の扱い

## 受入条件

- public API の型 fixture が compile する。
- config default は一箇所で定義され、getter ごとに stateful object を新規生成しない。
- options merge は `undefined` と明示値（特に `false`, `0`, `Infinity`）を正しく区別する。
- stable module の意図しない rename/behavior change がない。
- 後続 task が placeholder `legacy` interface に依存しない。

## 非目標

- socket を開くこと
- REQ/publish を動作させること
- v3 alias を decision 以上に実装すること
