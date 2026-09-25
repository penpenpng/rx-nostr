# Task 09: RxNostr facade と lifecycle

## 目的

完成した module を一つの public `RxNostr` instance に統合し、設定、操作、監視、dispose の契約を完成させる。

## 作業

- 完成した `RxNostr` class と構造的な `IRxNostr` interface を公開し、legacy declaration export と factory alias を除去する。
- config validation/default resolution を constructor 時に行い、signer/authenticator/reconnector/directory/WebSocket injection を接続する。
- `req`, `publish`, hot relay API, state monitor を collection/module に委譲する。
- instance disposal state を一元化し、全 new operation を同期的または契約どおり拒否する。
- dispose 順序を「受付停止 -> operation abort -> hot/query lease release -> communication close -> observer complete」として test する。
- multiple `RxNostr` instances が collection を共有せず、directory だけを共有することを検証する。
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

- source/workspace/dependency/release tooling の整理（Task 10）
- linter/formatter と静的品質ゲート（Task 11）
- package artifact/runtime matrix（Task 12）
- 利用者向け全ドキュメントの翻訳

## 実装結果

2026-09-21 に完了。

- 公開 `RxNostr` class に REQ、Publication、hot relay、connection state、directory/retry/auth/transport injection を統合し、外部の受け渡し契約として `IRxNostr` を維持した。class の内部状態は hard private とし、legacy factory/direct transport は public entry point から露出しない。
- instance の disposal gate を一元化した。`dispose()` は最初に受付を停止し、active REQ を complete、Publication を `cancelled`、hot lease を release してから collection/RelayCommunication/transport を dispose する。
- `dispose()` と `[Symbol.dispose]()` は同じ冪等処理。dispose 後の immediate mutator/publish は同期 throw、dispose 前後に作られた cold REQ/monitor は subscribe 時に `RxNostrAlreadyDisposedError` を通知する。
- dispose 前から active な state monitor は各 relay の `disposed` snapshot を受けてから complete する。pending retry、AUTH、query queue、publication timeout は下位 resource disposal により停止する。
- Publication は facade 内の active registry で管理し、natural cleanup 後は除去する。これにより instance dispose 時は collection より先に全 publication を cancel する。
- 同一 URL でも RxNostr instance ごとに別 collection/socket を所有し、注入した RelayDirectory の metadata/health entry だけを共有することを contract test で確認した。
- ReqPacket relay/traceTag > operation config > root defaults の優先順位と、operation verifier/boolean override が root verifier/default を上書きすることを wire test で固定した。
- `RxNostr.diagnostics` に全 instance の rx-nostr/unipls diagnostic を集約した。v3 `createAllErrorObservable()` が扱った不正 message、send 失敗、予期しない close、接続 attempt 失敗も relay 付きの rx-nostr 独自 snapshot として維持し、unipls identifier/type は公開しない。
