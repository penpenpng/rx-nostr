# v3 → v4 behavior matrix

## 分類

- `keep`: 利用者が得られる能力と主要な意味を維持する。API 名や型は破壊的に変更してよい。
- `replace`: 同じ問題を v4 の別概念/API で解決する。
- `remove`: v4 では提供しない。compatibility alias も置かない。
- `defer`: public API を壊さず追加できる seam だけを用意し、初期 v4 の完成条件から外す。

この表は v3 `main` の source、`packages/docs/{ja,en}/v3`、v4 `next`、D1–D14 を照合した release 契約です。

## Core、relay、connection

| v3 behavior                                                | v4 classification | v4 contract / reason                                                                                           | Task           |
| ---------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------- | -------------- |
| 一つの RxNostr instance が複数 relay node と同時通信する   | keep              | per-instance pool は URL ごとに connection を持ち、query/publish は複数 relay を並行利用する                   | 03, 06, 08, 09 |
| instance ごとに同一 relay への connection を分離する       | keep              | pool は instance local。共有するのは RelayDirectory metadata だけ                                              | 03, 04, 09     |
| default relays が宛先集合を表す                            | replace           | query/publish ごとの `RxRelays`/`RelayInput` が宛先を表す                                                      | 01, 06, 08     |
| default relays が常時接続対象を表す                        | replace           | `setHotRelays()` が connection の保温だけを担う                                                                | 03, 09         |
| default relay の read/write flag                           | remove            | read/write の宛先は各 `req()`/`publish()` 呼び出しで明示する                                                   | 01, 09, 10     |
| default relay 集合の reactive な更新                       | replace           | dynamic `RxRelays` が query destination を更新する。publication は開始時 snapshot                              | 03, 06, 08     |
| temporary relays (`on.relays`)                             | replace           | operation の `relays` は default/temporary を区別しない                                                        | 01, 06, 08     |
| lazy/lazy-keep/aggressive connection strategy              | replace           | lease、`defer`、`linger`、hot relays に分解する                                                                | 03             |
| 未使用 connection を既定 10 秒後に閉じる                   | keep              | REQ/publish の既定 `linger` は 10 秒                                                                           | 03             |
| connection state の Observable                             | keep              | rx-nostr 独自 state の `monitorConnectionState()` に置換                                                       | 05, 09         |
| transport error/message/outgoing-message の全量 Observable | remove            | transport detail は公開せず、relay state、diagnostic、operation result へ分類する                              | 01, 05, 09     |
| `reconnect(url)` による手動再接続                          | replace           | retry policy は RxNostr/pool が所有し、RelayDirectory からは操作しない。明示 API の要否は Task 05 で契約化する | 05             |
| exponential retry（初期 1 秒、最大 5 回）                  | keep              | rx-nostr 独自 retry policy を internal adapter で unipls に接続する                                            | 02, 05         |
| retry 時の `polite` option                                 | remove            | 初期 v4 には含めない。RelayDirectory health に基づく戦略は custom policy で実現可能にする                      | 05, 10         |
| WebSocket constructor injection                            | keep              | rx-nostr 独自 config として受け、unipls へ渡す。unipls 型は公開しない                                          | 01, 02         |
| direct WebSocket implementation/types                      | remove            | production code は unipls のみを伝送路として使う                                                               | 02             |

## REQ と受信 EVENT

| v3 behavior                                       | v4 classification | v4 contract / reason                                                         | Task              |
| ------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------- | ----------------- |
| RxReq → RxNostr → Observable の一方向 flow        | keep              | `RxReq` と `req()` の Observable を維持する                                  | 01, 06, 09        |
| forward strategy は直前の REQ を置換する          | keep              | relay ごとに current physical REQ を高々一つ保持する                         | 06                |
| backward strategy は複数 REQ を並行する           | keep              | EOSE/CLOSED/timeout/failure/removal まで各 segment を保持する                | 06                |
| `RxBackwardReq.over()` 後、全 REQ 完了で complete | keep              | 全 relay segment の terminal 後に complete する                              | 06                |
| Rx unsubscribe で Nostr CLOSE を送る              | keep              | ready な active physical REQ へ CLOSE を enqueue し、一度だけ cleanup する   | 06                |
| reconnect 後に active REQ を再発行する            | keep              | unipls recovery と protocol registry を接続する                              | 05, 06            |
| lazy `since`/`until` を送信直前に評価する         | keep              | 初回送信と resend の直前に評価する                                           | 06                |
| EVENT signature verification                      | keep              | operation/root verifier と `verify` operator を利用する                      | 01, 06            |
| REQ filter と EVENT の一致検証                    | keep              | opt-out option を維持する                                                    | 01, 06            |
| NIP-40 expiration filtering                       | keep              | opt-out option を維持する                                                    | 01, 06            |
| 一 relay の失敗で merged REQ を error にしない    | keep              | 正常な別 relay の EVENT を継続し、失敗は state/diagnostic へ出す             | 05, 06            |
| physical subId を EventPacket で公開する          | remove            | `subId`/`vreqId` は internal。利用者指定 `traceTag` だけを result へ伝播する | 01, 06            |
| NIP-11 `max_subscriptions` queue                  | keep              | RelayDirectory metadata を physical query planner が利用する                 | 04, 06            |
| 一つの vreq を複数 physical REQ へ分割する        | defer             | planner/vreq 境界だけを初期 v4 で固定する                                    | 01, 06, follow-up |
| 同一 relay URL へ複数 physical connection を張る  | defer             | RelayCommunication 内に将来の多重化 seam を置く                              | 02, 03, follow-up |

## Publish と AUTH

| v3 behavior                              | v4 classification | v4 contract / reason                                                 | Task   |
| ---------------------------------------- | ----------------- | -------------------------------------------------------------------- | ------ |
| EventSigner で EVENT を一度署名する      | keep              | publication ごとに一度署名し immutable snapshot を保持する           | 01, 08 |
| `send()` が OK Observable を返す         | replace           | publication object の `subscribe()` が raw `OkPacket` を通知する     | 01, 08 |
| `cast()` / `completeOn` で完了条件を選ぶ | replace           | `waitFor("all")` / `waitFor("any")` が Promise を返す                | 01, 08 |
| publish effort の取消                    | keep              | publication の `cancel()` を明示 API にする                          | 01, 08 |
| 実際に送信した signed EVENT の取得       | replace           | `event: Promise<Readonly<Event>>` を提供する                         | 01, 08 |
| publish 中の relay 集合更新              | replace           | publication 開始時に宛先を snapshot し、その後は変えない             | 08     |
| OK timeout                               | keep              | timeout は publication の typed rejection。別 relay の努力は継続する | 08     |
| reconnect 後の未確認 EVENT 再送          | keep              | delivery-unknown を明示した recovery policy で再送する               | 05, 08 |
| NIP-42 AUTH challenge への自動応答       | keep              | authenticator を指定した場合だけ応答する                             | 07     |
| AUTH success 後の REQ/EVENT 再送         | keep              | AUTH 中の `OK false`/CLOSED では all/any を早期 reject しない        | 07, 08 |
| signer があれば暗黙に AUTH を有効化      | remove            | wallet prompt を避けるため明示 opt-in にする                         | 07     |

## Metadata、utility、lifecycle

| v3 behavior                                      | v4 classification | v4 contract / reason                                                        | Task       |
| ------------------------------------------------ | ----------------- | --------------------------------------------------------------------------- | ---------- |
| static `Nip11Registry` cache                     | replace           | global default + injectable `RelayDirectory` が NIP-11 と health を集約する | 04         |
| NIP-11 manual get/fetch/set/default/forget       | replace           | directory の read/refresh/import/forget と versioned snapshot に再設計する  | 04         |
| relay metadata の自動永続化                      | remove            | application が versioned JSON export/import の保存先を選ぶ                  | 04         |
| event signer/verifier extension                  | keep              | v4 の class-based interface を維持する                                      | 01, 07, 08 |
| worker verifier                                  | keep              | public API と worker lifecycle を contract test する                        | 01, 10     |
| RxJS packet/general operators                    | keep              | 明確な型欠陥を除き既存 v4 API を維持する                                    | 01, 10     |
| `dispose()` / `Symbol.dispose`                   | keep              | 冪等に operation、lease、transport、observer を終了する                     | 03, 09     |
| v3 API 名 (`use`, `send`, default relay methods) | remove            | D1 により compatibility alias を置かない                                    | 09, 10     |

## Release audit rule

Task 10 では各 `keep`/`replace` 行を contract spec または migration docs に対応付けます。`remove` は public export/type fixture に残っていないこと、`defer` は将来の追加に public breaking change を要求しないことを確認します。
