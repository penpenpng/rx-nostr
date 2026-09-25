# Decision record

## 運用

- `pending` の必須 decision に依存する実装タスクは開始しません。
- 利用者の回答を受けたら、`Decision`、`Rationale`、`Decided at` を記録し、関連タスクの blocker を解除します。
- 推奨案を一括で採用する場合は「D1〜D14 は推奨案で進める」のような回答で構いません。

## D1: v4 public API と v3 compatibility

- Status: **decided at 2026-09-21**
- Question: v4 は現在の `req`、`publish`、`setHotRelays`、`monitorConnectionState` を正規 API とし、v3 の `use`、`send`、default relay API の compatibility alias を持たない方針でよいですか。
- Recommended: alias を持たない。migration guide で対応関係を示し、v4 内に二重の概念を残さない。
- Alternatives: 一リリースだけ deprecated alias を置く／主要名を再設計してから固定する。
- Decision: Recommended を採用する。v3 compatibility alias は設けない。
- Rationale: v4 内に旧概念と新概念を二重に残さず、migration guide で対応関係を説明する。

## D2: RelayDirectory の所有権と制御能力

- Status: **decided at 2026-09-21**
- Question: process-wide の `GlobalRelayDirectory` を既定値とし、`new RxNostr({ relayDirectory })` で instance/test ごとに注入可能にしたうえで、directory は metadata 観測だけを担い `relay.retry()` のような connection 制御 API を持たない方針でよいですか。
- Recommended: 上記のとおり。connection 制御は各 RxNostr pool/unipls に限定する。
- Alternatives: global singleton のみ／directory が全 instance の connection handle も集約し retry を broadcast する。
- Decision: Recommended を採用する。global default と注入可能な directory を用意し、directory から connection を操作しない。
- Rationale: relay metadata の共有と、RxNostr instance ごとの connection ownership を分離する。

## D3: RelayDirectory snapshot

- Status: **decided at 2026-09-21**
- Question: directory の永続化は version 付き JSON snapshot の明示的な `export`/`import` のみにし、自動保存は行わず、NIP-11 と health timestamps/counters だけを保存する方針でよいですか。
- Recommended: 上記のとおり。import は既存の live data を破壊しない merge、live connection count/state と error object は保存しない。
- Alternatives: `serialize`/`deserialize` で全置換／storage adapter と TTL を v4 に含める／永続化 API 自体を初期 v4 から外す。
- Decision: Recommended を採用する。versioned JSON の明示的 export/import とし、自動保存は行わない。
- Rationale: live resource を永続 state に混ぜず、保存先の選択を application に委ねる。

## D4: connection-reconnector と unipls reconnector の関係

- Status: **decided at 2026-09-21**
- User feedback: unipls を rx-nostr の public API に露出させないことを要求。
- Revised question: retry engine の実行は unipls に委ねつつ、public config では rx-nostr 独自の `ConnectionReconnector`/context/decision だけを公開し、内部 adapter が unipls reconnector へ変換する方針でよいですか。
- Revised recommendation: unipls の型を一切 public `.d.ts` に出さない。現在の `createRetry(): Observable<void>` は、initial/recovery、cancel/exhaust、AbortSignal、relay health を表現できる rx-nostr 独自 policy I/F へ置き換える。default backoff も rx-nostr の built-in として export する。
- Rejected proposal: public config が `UniplsReconnector` を直接受け取る形。
- Decision: Revised recommendation を採用する。public API には rx-nostr 独自の retry policy だけを公開し、unipls reconnector への変換は internal adapter に閉じ込める。
- Rationale: transport implementation を交換・更新しても rx-nostr の public API と利用者コードへ影響させない。

## D5: connection state と relay 単位の失敗

- Status: **decided at 2026-09-21**
- User feedback: 一つの質問に異なる論点が混在していたため具体化を要求。
- D5a question (state abstraction): `monitorConnectionState()` では unipls lifecycle をそのまま返さず、`dormant | connecting | connected | waiting-for-retry | retrying | failed | disposed` のような rx-nostr 独自 state と、必要最小限の reason/attempt metadata を返す方針でよいですか。
- D5a recommendation: 採用する。unipls の version/API 変更から rx-nostr 利用者を隔離し、Nostr application が必要とする relay 単位の状態だけを安定契約にする。
- D5b question (failure isolation): relay A/B に同じ REQ を送っているとき A が drop または retry exhaustion になっても、merged REQ Observable を error にせず B の EVENT を継続して流す方針でよいですか。A の失敗は connection state/diagnostic で観測し、backward query は全 relay segment が EOSE/CLOSED/timeout/failure/removal のいずれかで terminal になれば complete します。
- D5b recommendation: 採用する。一つの relay の不調で、成功している別 relay の結果を失わない。query 全体の error は filter evaluation など全 relay に共通する operation-wide failure に限定する。
- Decision: D5a と D5b の両方を採用する。rx-nostr 独自 connection state を公開し、relay-local failure は複数 relay operation 全体を error 終了させない。
- Rationale: unipls の実装詳細を隠し、一つの relay の不調によって正常な別 relay の結果を失わない。

## D6: publish の出力契約

- Status: **decided at 2026-09-21**
- Question: `publish()` は宛先ごとの `waiting | sent | accepted | rejected | timeout | failed` と aggregate count の immutable snapshot を発行し、全宛先が terminal で complete する契約でよいですか。
- Recommended: 上記のとおり。`OK true` のみ accepted、`OK false` は rejected、送信完了だけを成功とは数えない。unsubscribe は残りを cancel する。
- Alternatives: raw `OkPacket` だけを返す／最初の accepted で complete／v3 の `completeOn` を復活させる。
- Decision: `publish()` は progress Observable ではなく publication operation object を返す。この object は次を提供する。
  - relay から届く `OkPacket` の subscription
  - EVENT 送出努力の cancel
  - all policy: 全 relay の最終 OK が `true` なら resolve、AUTH 再送予定ではない `OK false` が一つでもあれば reject する Promise
  - any policy: いずれかの最終 OK が `true` なら resolve、全 relay が AUTH 再送予定ではない `OK false` なら reject する Promise
  - 実際に署名・送信した EVENT の detached mutable copy の取得
- Rationale: raw OK の reactive な観測、命令的 cancellation、代表的な all/any 完了待ちを一つの publication lifecycle から利用できるようにする。any が resolve しても、残る relay への送出努力は明示的に cancel されるまで継続できる設計とする。
- API completion: publication は `publish()` 呼び出し時に開始し、`subscribe(...)`、`cancel()`、`waitFor("all" | "any")`、`event: Promise<Event>` を提供する。送信用 snapshot は内部で不変に保ち、公開する EVENT は独立した変更可能な copy とする。timeout/drop/retry exhaustion/cancel/no-relay は final OK を得られないため typed rejection とする。

## D7: NIP-42 authentication の既定動作

- Status: **decided at 2026-09-21**
- Question: signer があっても AUTH は既定で無効とし、`authenticator` を明示した場合だけ challenge へ応答・拒否された operation を再送する方針でよいですか。
- Recommended: opt-in。意図しない NIP-07 prompt を避け、relay ごとの authenticator factory/undefined を許す。
- Alternatives: signer があれば常に `SimpleAuthenticator` を使う／challenge は通知だけして自動再送しない。
- Decision: Recommended を採用する。AUTH は明示的な opt-in とする。
- Rationale: signer の存在だけで意図しない NIP-07 prompt を発生させない。

## D8: runtime support baseline

- Status: **decided at 2026-09-21**
- Question: unipls の現在の support matrix（ES2022、Node >= 22.4、Deno >= 2、Bun >= 1.2、主要 browser 最新 2 系統）を rx-nostr v4 の最低条件として採用してよいですか。
- Recommended: 採用する。ただし rx-nostr が追加で使う `Set.prototype.union` 等が matrix 全体で使えるか package test し、必要なら内部 helper へ戻す。
- Alternatives: rx-nostr の既存 support を維持するため unipls 側の条件変更を相談する。
- Decision: Recommended を採用し、unipls の support matrix を v4 の最低条件とする。
- Rationale: transport dependency と異なる runtime floor を掲げず、package tests で追加 API の互換性を検証する。

## D9: 初期 v4 の query planning scope

- Status: **decided at 2026-09-21**
- Question: 初期 v4 は「1 RxNostr instance・1 relay URL・1 physical connection」「1 vreq・1 relay・1 REQ」を実装範囲とし、多重接続と自動 filter 分割は seam と contract だけを用意して後続版へ送ってよいですか。
- Recommended: 初期範囲から外す。planner 境界と opaque vreq identity を維持し、将来の実装で public API を壊さない。
- Alternatives: v4 リリース条件として多重化または filter 分割の少なくとも一方を実装する。
- Decision: Recommended を採用する。初期 v4 では一つの relay URL あたり一つの physical connection、一つの vreq/relay あたり一つの REQ とする。ただし、一つの RxNostr instance は v3 と同様に複数 relay node と同時通信できなければならない。
- Rationale: 将来の同一 relay 多重化・filter 分割は seam を維持しつつ後続版へ送り、v3 の multi-relay 能力は退行させない。

## D10: publish 中の RxRelays 更新

- Status: **decided at 2026-09-21**
- Question: `publish()` に動的な `RxRelays` を渡した場合、Observable subscription 時点の relay 集合を snapshot とし、その後の追加・削除は進行中の publish に反映しない契約でよいですか。
- Recommended: snapshot にする。一回の publish の完了条件と progress の母集団を安定させ、動的 routing が必要なら新しい publish operation を開始する。
- Alternatives: complete まで追加 relay へ同じ EVENT を送り、削除 relay は cancel する／引数から `RxRelays` を外して static iterable だけ許す。
- Decision: Recommended を採用し、publication 開始時の relay snapshot を使う。
- Rationale: 一回の publication の対象集合と all/any completion 条件を安定させる。

## D11: default reconnect policy

- Status: **decided at 2026-09-21**
- Question: v4 も既定で自動再接続を有効にし、初回接続失敗と ready 後の drop に capped exponential backoff + jitter（初期 1 秒、最大 5 回）を使ってよいですか。
- Recommended: v3 の可用性を維持するため有効にする。成功後は attempt count を reset し、idle close/dispose では再接続しない。`polite` は初期 v4 から外す。
- Alternatives: unipls と同じ no-retry を既定にする／回数制限なし／RelayDirectory の health で既定 policy を変える。
- Decision: Recommended を採用する。既定は capped exponential backoff + jitter、初期 1 秒、最大 5 回とする。
- Rationale: v3 の既定の可用性を維持し、idle close/dispose と unexpected drop を区別する。

## D12: NIP-11 max_subscriptions queue

- Status: **decided at 2026-09-21**
- Question: v3 にあった NIP-11 `limitation.max_subscriptions` に基づく REQ queue を、初期 v4 の完成条件に含めますか。
- Recommended: 含める。RelayDirectory を導入する直接的な利用価値があり、query planner の境界を実戦で検証できる。metadata がない場合は queue 制限なしとする。
- Alternatives: directory は cache/health のみで使い、queue は filter splitting/multiplexing と同じ後続版へ送る。
- Decision: Recommended を採用し、NIP-11 `max_subscriptions` queue を初期 v4 に含める。
- Rationale: v3 の能力を維持し、RelayDirectory と REQ planner を実際の制御に利用する。

## D13: logical vreq と REQ subId の公開

- Status: **decided at 2026-09-21**
- Question: query result packet では wire 上の `subId` と、relay/分割をまたいで同じ logical query を表す opaque `vreqId` を別フィールドとして公開してよいですか。
- Recommended: 両方を区別して公開する。`subId` は protocol inspection 用で安定した correlation key ではないと明記し、application の対応付けには `vreqId` または利用者指定 `traceTag` を使う。
- Alternatives: REQ `subId` だけ公開／`subId` を raw tuple にだけ残して top-level から除去／logical id は公開せず `traceTag` だけ使う。
- Decision: query result では利用者指定の `traceTag` だけを correlation value として公開する。REQ `subId` と logical `vreqId` は top-level field、raw tuple を含め public result に露出させず、internal value とする。
- Rationale: 一つの vreq が複数 REQ へ分割されても public identity contract を変えず、application が transport 内部 ID に依存することを防ぐ。

## D14: operation connection の既定 lifetime

- Status: **decided at 2026-09-21**
- Question: REQ は既定を `defer: true`、REQ/publish の `linger` は既定を `10_000ms` とし、送信が必要になるまで接続せず、operation 終了後は 10 秒だけ再利用可能にしてから閉じる方針でよいですか。
- Recommended: 上記のとおり。hot relay だけが operation をまたいで無期限に connection を維持する。forward の active REQ は operation 終了まで lease を保持する。
- Alternatives: 現行 sketch の `defer: false` / `linger: Infinity`／終了後すぐ閉じる `linger: 0`／root config では既定を持たず必須指定にする。
- Decision: Recommended を採用する。REQ の既定は `defer: true`、REQ/publish の既定 linger は 10 秒とする。
- Rationale: operation が必要になるまで接続せず、hot relay だけが operation をまたいで無期限に connection を維持する。

## 実装内で決めてよい事項

次は上記 decision と公開契約を変えない限り、タスク実装者が test を伴って決められます。

- internal class/file 名と private data structure
- subId の具体的な文字列表現
- RxJS と unipls callback handle の adapter 実装方法
- health counter 更新の atomicity と時刻取得の注入方法
- test clock、controlled transport、fixture の構成
- NIP-11 in-flight request deduplication の内部方式
