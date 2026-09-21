# Task 02: unipls transport adapter

Status: **complete (2026-09-21)**

## 目的

rx-nostr の production code から direct WebSocket 実装を排除し、Nostr message と unipls operation をつなぐ単一 relay adapter を作る。

## 作業

- `unipls` を rx-nostr の workspace/runtime dependency として正しく宣言する。利用者の submodule/lockfile 変更を先に確認する。
- `Unipls<Nostr.ToRelayMessage.Any, DecodedRelayMessage>` を生成する factory を作る。
- serializer は JSON stringify、deserializer は JSON parse + tuple shape validation を行い、不正 message を typed diagnostic へ流す。
- WebSocket constructor、D11 の reconnector、drop detectors、timeout を config から unipls へ渡す。
- unipls events/lifecycle を内部 observable または callback bridge へ変換する。
- unipls callback `SubscriptionHandle.closed` を RxJS Observable の complete/error/unsubscribe と一度だけ対応付ける adapter を作る。
- direct WebSocket files と `IWebSocket*` public config を参照しないようにする。削除は import がなくなった時点で行う。
- controlled WebSocket で open、message、peer close、transport error、reconnect、stale message、user close を再現する tests を作る。

## 設計上の制約

- adapter は Nostr の REQ/publish semantics をまだ持たない。
- unipls error を握り潰さず、rx-nostr domain error/state へ変換する入口を一つにする。
- `open()`/`close()` の競合や再入を独自 state flag だけで解決せず、unipls lifecycle を source of truth とする。
- unipls source の deep import を配布 code に含めない。
- unipls の public type も rx-nostr の public declaration から参照しない。

## 受入条件

- v4 production tree に `new WebSocket`、`onopen`、`onclose`、`readyState` の直接利用がない（test doubles を除く）。
- valid Nostr tuples は typed packet に decode され、invalid JSON/tuple は process を落とさない。
- callback handle の成功、drop、timeout、unsubscribe が RxJS で一度だけ終端する。
- old transport epoch の遅延 message が current adapter state を変えないことを test する。
- adapter を dispose すると unipls session と listener が残らない。
- package の `.d.ts` に `unipls` import が現れない。

## unipls 相談トリガー

公開 API だけでは lifecycle observation、protocol CLOSE の送信順、controlled transport test のいずれかを安全に実現できない場合、workaround を埋め込まず利用者へ相談する。

## 実装結果

- `NostrTransport` に unipls の生成、Nostr codec、lifecycle/diagnostic bridge、callback handle から RxJS への終端変換を集約した。
- `ConnectionRetryer` の `retry | cancel | exhaust` を internal reconnector へ変換し、既定を最大 5 回の capped exponential backoff + jitter とした。
- `RelayCommunication` は transport を所有し、remote `CLOSE` を local unsubscribe より先に送る protocol 境界を担当する。REQ/publish の完全な状態機械は Tasks 06/08 のままとする。
- rx-nostr 所有の controlled WebSocket fixture で open/message/user close、peer close、transport error、retry、old epoch isolation、timeout、unsubscribe、dispose を検証した。
- production tree から direct WebSocket 実装を削除した。unipls import は internal transport directory にだけ存在し、root public entry point からは到達しない。
- unipls 公開 API だけで要件を満たせたため、`packages/unipls` は変更していない。
- `package.json` には workspace runtime dependency を宣言した。既存 `package-lock.json` は利用者変更を保護するためこの task では更新せず、release package 整合性を扱う Task 10 で明示的に同期する。
