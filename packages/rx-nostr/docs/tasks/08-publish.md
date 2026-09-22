# Task 08: Publish pipeline

## 目的

signing、複数 relay 送信、OK/AUTH/timeout を、一つの publication operation object として実装する。

## 作業

- `publish()` 呼び出し時に publication を開始し、signer を解決して event を一度だけ署名する。
- target RxRelays を publication 開始時に snapshot する。
- relay ごとに lease を取得し、EVENT cast + matching OK subscription を開始する。
- OK listener を送信前に登録し、高速応答を取りこぼさない。
- OK true/false と auth-required を raw `OkPacket` subscription へ流し、timeout、drop、retry exhaustion も publication lifecycle へ反映する。
- AUTH 後の再送と duplicate OK を event id/attempt で調停する。
- all/any policy の Promise を同じ relay state table から settle し、any が resolve しても残りを暗黙に cancel しない。
- 実際に署名・送信する EVENT の detached mutable copy を返す。
- signer error は publication 全体の失敗、relay-local failure は他 relay の送出努力を中断しない（D5b）。
- OK subscription の unsubscribe はその observer だけを外し、送出努力は継続する。
- publication の `cancel()` または RxNostr dispose で pending send/listener/retry/lease を解放する。

## 必須 scenario

- all accepted、mixed accepted/rejected、timeout、one relay dropped
- no destination relay
- signer rejects / returns invalid event
- unsubscribe before sign completes、before open、after sent
- AUTH success/failure and EVENT resend
- hot relay への publish と cold relay への publish
- reconnect before OK: delivery-unknown を踏まえた resend policy

## 受入条件

- OK subscription が wire 上の OK packet を順序どおり受け取れる。
- AUTH による再送が控えている `OK false` では all/any Promise を早期 reject しない。
- all policy は全 relay の最終 OK true でのみ resolve し、any policy は最初の最終 OK true で resolve する。
- publication の明示 cancel 後は新しい送信・再送を行わず、保留 Promise を規定の error で reject する。
- EVENT snapshot は signer が返した object の後続 mutation に影響されない。
- one relay の failure が他 relay の送信/OK を中断しない。
- test 終了時に active listener/lease/timer が残らない。

## 非目標

- v3 `cast()` compatibility（D1 で採用した場合は Task 09 で facade として追加）
- relay quorum/first-success policy の一般化

## 実装結果

2026-09-21 に完了。

- `publish()` 呼び出し時に宛先を normalized snapshot 化し、接続 prewarm と一回だけの署名を開始する hot `PublicationOperation` を実装した。observer の有無は operation lifecycle に影響しない。
- signer の戻り値を検証して tag を含む immutable clone を内部送信用に保持し、`event` Promise へは detached mutable copy を返す。no relay は signer を呼ばず `no-relays`、throw/reject/invalid event は cause を保持する `RxNostrCallbackError("signer")` になる。
- relay ごとの同一 state table から raw `OkPacket` replay stream、`waitFor("all")`、`waitFor("any")` を駆動する。all は最初の final failure で reject、any は最初の acceptance で resolve し、any 成功後も他 relay の努力を継続する。
- AUTH-related `OK false` は即時に observer へ流すが final failure にせず、AUTH/再送後の final OK または auth failure まで settlement を保留する。
- timeout、drop/retry exhaustion、rejected、auth callback failure、cancel を relay failure snapshot に分類する。一 relay の terminal failure は他 relay の subscription/lease を終了しない。
- observer unsubscribe は観測だけを終了する。冪等な `cancel()` と RxNostr disposal は pending signing/send/AUTH/retry/timeout/lease を停止し、保留 settlement を `cancelled` で reject する。
- finite linger は terminal 後も lease を維持し、cleanup 後に RxNostr の temporary resource registry から外れる。hot relay lease は publish lease と独立して残る。
- controlled WebSocket の public contract で all accepted、mixed、timeout、drop、no relay、signer failure/invalid return、cancel、observer unsubscribe、AUTH resend、hot/cold、reconnect resend、snapshot/replay を検証した。旧 progress packet model は D6 に従い削除した。
