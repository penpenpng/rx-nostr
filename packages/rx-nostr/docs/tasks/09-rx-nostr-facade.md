# Task 09: RxNostr facade と lifecycle

## 目的

完成した module を一つの public `RxNostr` instance に統合し、設定、操作、監視、dispose の契約を完成させる。

## 作業

- 実 `createRxNostr()` が完成した `RxNostr` class/interface を返すようにし、legacy declaration export を除去する。
- config validation/default resolution を constructor 時に行い、signer/authenticator/reconnector/directory/WebSocket injection を接続する。
- `req`, `publish`, hot relay API, state monitor を pool/module に委譲する。
- instance disposal state を一元化し、全 new operation を同期的または契約どおり拒否する。
- dispose 順序を「受付停止 -> operation abort -> hot/query lease release -> communication close -> observer complete」として test する。
- multiple `RxNostr` instances が pool を共有せず、directory だけを共有することを検証する。
- D1 で決めた v3 alias の有無を反映する。
- public error/diagnostic/logging に secret event parameters や opaque WebSocket object を出さない。

## 受入条件

- README 相当の minimal example が controlled relays で動作する。
- 同じ URL に対して instance ごとに別 connection、directory 上は同じ relay entry になる。
- `dispose()` と `[Symbol.dispose]()` は同じ冪等処理である。
- dispose が req/publish/state Observables を契約どおり終端する。
- disposed instance は hot relay の更新や reconnect を開始しない。
- root config、operation options、ReqPacket options の優先順位が contract test で固定される。
- public entry point から未完成/legacy/direct WebSocket API が消える。

## 非目標

- package artifact/runtime matrix（Task 10）
- 利用者向け全ドキュメントの翻訳
