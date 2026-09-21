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
- 実際に署名・送信する EVENT の immutable snapshot を返す。
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
