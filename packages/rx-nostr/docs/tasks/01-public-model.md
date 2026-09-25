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
- `strategy: "oneshot"` descriptor が backward strategy になること
- verifier/filter/expiration pipeline の順序と失敗時の挙動
- query result が利用者指定 `traceTag` を保持し、REQ/logical internal ID を公開しないこと
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

## 実施結果

- Status: **completed at 2026-09-21**
- [public-contract.md](../public-contract.md) に operation start、option precedence、relay normalization、pipeline、error semantics を固定した。
- `RelayInput` と rx-nostr 所有の structural WebSocket types を共通 `types` module へ移した。public declaration は unipls 型を参照しない。
- `EventPacket` は `from`、`event`、任意の `traceTag` のみにし、`subId`、`vreqId`、それらを含む tuple を public query result から除外した。
- `Publication`、all/any policy、failure snapshot、typed publication/callback errors を公開 model として追加した。
- connection state を rx-nostr 独自 discriminated union に置き換え、公開時には detached mutable copy を返すようにした。
- config defaults と merge を一箇所へ集約し、D14 の `defer: true` / `linger: 10_000ms`、AUTH opt-in、operation override を反映した。constructor-level の `RxNostr.defaultConfig` と operation-level の `RxNostr.defaultOptions` を別 namespace に置き、instance override を static default より優先して解決する。
- v3 compatibility placeholder を削除し、concrete `RxNostr` class、未完成 RelayDirectory、protocol packet types を root entry point から隠した。
- `RelayUrl` の `ws://` hostname 型欠陥、`RxOneshotReq` の stale `traceId`、`batch()` の `RelayInput` 型欠陥を修正した。

検証結果:

- `npm run test:unit -w packages/rx-nostr`: 6 files / 25 tests passed
- `npm run test:contract -w packages/rx-nostr`: 1 file / 4 tests passed
- `npm run lint -w packages/rx-nostr`: passed
- typecheck の Task 01 所有 diagnostics: 0
- repository 全体の v4 typecheck: expected failure（34 diagnostics、すべて Tasks 02/03/04/08/09 所有）
