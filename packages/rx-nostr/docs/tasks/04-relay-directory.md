# Task 04: RelayDirectory

Status: **complete (2026-09-21)**

## 目的

relay node 自体に紐づく metadata/health を instance 横断で集約し、connection ownership と分離する。

## 作業

- D2/D3/D12 に従い public read model と internal reporter を分ける。
- `get`, `getOrCreate`, `forget`, iteration/observation の必要最小 API を定義する。
- normalized URL を key とし、alias から同じ entry が得られることを保証する。
- NIP-11 fetch の in-flight deduplication、取得成功/失敗時刻、明示 refresh、manual set を実装する。
- `{}` を成功と失敗の両方に使う現行 `fetchRelayInfo` を見直し、fetch/parse/status error を区別する。
- 複数 RelayCommunication から open/drop/close report を受け、last success/failure、consecutive failure、live connection count を一貫して更新する。
- D3 の versioned snapshot schema、validation、merge/migration を実装する。
- system clock と fetcher を test で注入可能にする。

## data ownership

- Directory: NIP-11、observed health、timestamps/counters
- RelayCommunication/unipls: live handle、session/connection id、retry timer、active operation
- RxRelays: destination membership

この境界を越える object reference を snapshot に保存しない。

## 受入条件

- 同じ URL への同時 NIP-11 request は一つに dedupe される。
- 一 instance の close が、別 instance の同 URL connection count を 0 にしない。
- connection success で consecutive failures が reset される規則を test する。
- malformed/unknown-version snapshot を部分適用せず typed error にする。
- import/export round trip で永続対象だけが保持される。
- directory entry から socket/retry を直接操作できない（D2 推奨案採用時）。

## 非目標

- localStorage/IndexedDB/file への自動保存
- relay recommendation/scoring
- NIP-11 TTL の自動 background refresh（必要なら後続 task）

## 実装結果

- `RelayDirectory` と process-wide の `GlobalRelayDirectory` を公開し、`RxNostrConfig.relayDirectory` から instance/test 単位で差し替え可能にした。
- public entry は内部状態から切り離した mutable snapshot とし、connection lifecycle の書き込み口は internal reporter に分離した。directory から socket、retry、connection handle は操作できない。
- URL alias の正規化、列挙、観測、forget を実装した。active connection または NIP-11 request がある entry は forget しない。
- NIP-11 の cache、in-flight deduplication、明示 refresh、manual set、成功/失敗時刻、`maxSubscriptions` の導出を実装した。
- `fetchRelayInfo` は network、HTTP status、JSON parse、invalid response を `RxNostrNip11Error` で区別する。
- 複数 instance からの connection 数、最終成功/失敗時刻、連続失敗回数を集約できる reporter を実装した。close handle は冪等で、接続成功時に連続失敗回数を reset する。
- version 1 JSON snapshot を実装した。import は全件 validation 後の merge とし、live connection state は保存せず、malformed/unknown version は `RelayDirectorySnapshotError` で拒否する。

RelayCommunication から reporter へ lifecycle を配線する作業は Task 05 が担当する。Task 04 では directory 単体の集約規則までを検証した。
