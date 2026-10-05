# 公開前監査レポート

監査日: 2026-10-05（JST）。対象コミット: `e4625d47584fffcc8e2343b83cd01dbd5ccefc15`。

**現状のままの公開は見送りを推奨する。** 既存テスト、ビルド、lint は成功するが、イベント検証、publication の成否判定、legacy の送信完了判定に実害のある問題を再現した。さらに、主要な導入例が現在の公開 API と一致せず、WASM パッケージの型定義を標準的な TypeScript 設定で解決できない。

本監査では実装の修正は行っていない。確認済みの不具合、文書の不整合、設計上の改善事項を区別して記載する。P1 は公開前の修正を推奨する重大な問題、P2 は特定条件での不具合または公開契約の不足を表す。P2 も対応する機能を公開対象とするなら、修正または明示的な仕様決定が必要である。

## 対象と検証結果

対象は `rx-nostr` の root / operators / utils / legacy、`@rx-nostr/crypto`、`@rx-nostr/crypto-wasm`、日本語・英語 v4 docs、README、公開契約テスト・単体テスト・テスト補助コード・配布設定である。v2/v3 docs は過去バージョンの説明として扱い、旧 API の記載だけでは不具合と判定していない。

| 検証                                           | 結果                                            | 意味・限界                                                                                                    |
| ---------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `pnpm test`                                    | 成功                                            | 3 つのライブラリパッケージの既存テストが成功                                                                  |
| rx-nostr の JSON reporter による集計           | 35 ファイル、304 テスト成功、失敗・pending なし | contract / unit の両方を含む                                                                                  |
| `pnpm build`                                   | 成功                                            | rx-nostr の `tsc --project tsconfig.check.json` と各パッケージの成果物生成を含む                              |
| `pnpm docs:build`                              | 成功                                            | Markdown の描画成功であり、サンプルの型検査ではない                                                           |
| `pnpm lint` / `pnpm format:check`              | 成功                                            | report 作成前の既存ツリーで実行                                                                               |
| ビルド成果物を使う独立した TypeScript consumer | **失敗**                                        | WASM の import で TS7016（F04）                                                                               |
| 正常署名済み EVENT の ID のみ改変              | **不具合を再現**                                | 通常 crypto は受理、WASM は拒否（F01）                                                                        |
| 追加の一時的な Vitest 検証                     | 9 シナリオで現在の問題挙動を確認                | F02、F05、F06、F08〜F14。問題挙動を期待して通した検証であり、正しい仕様の回帰テストが通ったという意味ではない |
| URL と import 前提の追加検証                   | **問題を確認**                                  | F07、F16                                                                                                      |
| `pnpm changeset:status`                        | 成功                                            | 3 パッケージとも次期版は 4.0.0 と計算された                                                                   |

実行環境は Node.js 24.13.1、既存のインストール済み依存関係。実リレーとの通信、実ブラウザ・実 Worker の統合試験、全対応 runtime の試験、長時間負荷試験、npm registry への公開は行っていない。Worker の問題は制御した worker mock で再現した。型解決検証は独立した `/tmp` consumer からビルド済みパッケージを symlink で参照したもので、tarball をインストールする最終配布試験は別途必要である。

## 指摘一覧

| ID  | 重要度 | 分類          | 指摘                                                         |
| --- | ------ | ------------- | ------------------------------------------------------------ |
| F01 | P1     | API・検証     | 通常 crypto が `event.id` の改変を検出しない                 |
| F02 | P1     | API・責務境界 | OK observer が publication の成功・失敗を変更できる          |
| F03 | P1     | docs          | README / 日本語 v4 docs の主要 query API が現行 API と異なる |
| F04 | P1     | 配布 API      | WASM の exports に型定義の経路がない                         |
| F05 | P1     | legacy API    | `cast()` が未送信で成功し、送信処理を cancel する            |
| F06 | P2     | legacy API    | AUTH timeout adapter が class のメソッドを失う               |
| F07 | P2     | API           | URL 正規化が query parameter の意味を変更する                |
| F08 | P2     | API           | `since` / `until` の 0 が失われる・無視される                |
| F09 | P2     | API 一貫性    | static filter と `RxReq.emit()` の正規化が異なる             |
| F10 | P2     | operator      | 同一時刻の EVENT の優先 ID が docs の NIP-01 順序と逆        |
| F11 | P2     | lifecycle     | Worker verifier の dispose が未完了 Promise を放置する       |
| F12 | P2     | timeout       | Worker verifier の timeout が設定値の約 1〜2 倍になる        |
| F13 | P2     | error 契約    | Worker 内 verifier の例外が `false` に変換される             |
| F14 | P2     | lifecycle     | 派生 `RxReq` の dispose が派生 stream を終了しない           |
| F15 | P2     | docs          | 英語 v4 の全 14 ページが空で、ナビゲーションから到達できる   |
| F16 | P2     | runtime 契約  | 必須組み込み機能・polyfill の前提が導入 docs にない          |

## 詳細

### F01 — EVENT の ID 改変を通常 crypto が受理する

根拠: [crypto.ts](packages/crypto/src/libs/nostr/crypto.ts) 81〜87 行、[SimpleVerifier](packages/crypto/src/event-verifier/simple-verifier.ts)。WASM 側は [crypto.ts](packages/crypto-wasm/src/libs/nostr/crypto.ts) の `Event.fromJson(...).verify()` を使用する。

通常版は再計算したハッシュに対する署名を検証するが、そのハッシュと `event.id` の一致を確認しない。ビルド成果物で次の操作を実行すると、通常版は `true`、WASM 版は `false` を返した。

```ts
const valid = signEvent(
  { kind: 1, content: "audit", created_at: 1, tags: [] },
  "0".repeat(63) + "1", // 再現専用の公開された固定テスト鍵
);
const changed = { ...valid, id: "0".repeat(64) };
verifyEvent(changed); // 実測: true
```

署名自体を偽造できるという意味ではない。しかし、署名済み内容と異なる ID を「検証済み」として扱え、ID filter、重複排除、EVENT 参照、cache の同一性を壊す。通常版と WASM 版を差し替えたときの意味も一致しない。[NIP-01 の EVENT 定義](https://github.com/nostr-protocol/nips/blob/master/01.md#events-and-signatures) に基づき、構造・ID と再計算ハッシュの一致・署名の検証を一つの検証契約として定めるべきである。

修正・回帰試験: ID のみ変更、content のみ変更、sig のみ変更、異常なフィールドを含む共通ベクタを両 crypto 実装に適用する。既存の verifier テストは正常例・sig 欠落・tags 欠落を検査しているが、ID の独立した改変を検査していない。

### F02 — observer の書き換えが publication の成否を変える

根拠: [publication-operation.ts](packages/rx-nostr/src/rx-nostr/operation/publish/publication-operation.ts) 224〜226、244〜259 行。

`delivery.lastOk` と `ReplaySubject` に同一の `OkPacket` を渡し、observer の実行後に `lastOk.ok` から成功判定する。そのため次の observer を登録すると、リレーの `OK false` を受け取っても `waitFor("all")` が resolve することを確認した。

```ts
publication.subscribe((packet) => {
  packet.ok = true;
});
// リレーから ["OK", event.id, false, "blocked: rejected"] を送る
await publication.waitFor("all"); // 実測: 成功する
```

逆方向の書き換えは成功を失敗にできる。同じ object は後続 observer と replay にも共有される。`event` や connection state では内部値と公開 copy を分けている一方、OK ではその境界が成立していない。

修正・回帰試験: 内部判定用の snapshot を公開 object から分離する。各 observer と replay の値の所有権も決め、`ok`、`eventId`、`message` tuple の変更が集約結果・他 observer・同一 EVENT の別 publication に影響しないことを確認する。

### F03 — 導入例と query の説明が現在の API と異なる

根拠: [root README](README.md) 42〜58 行、[配布 README](packages/rx-nostr/README.md) 42〜63 行、[query docs](packages/docs/ja/v4/query.md)、[configuration docs](packages/docs/ja/v4/configuration.md)、[migration guide](packages/docs/ja/v4/migration-guide.md)、[dispose docs](packages/docs/ja/v4/dispose.md)。対照は [RxNostr](packages/rx-nostr/src/rx-nostr/rx-nostr.ts) 95〜125 行、[RxReq](packages/rx-nostr/src/rx-req/rx-req.ts)、[公開 exports](packages/rx-nostr/src/index.ts)。

| 文書上の API                                                                        | 現行実装                                                                                                 |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `rxNostr.req(relays, request)`                                                      | `forward(relays, request)` / `backward(relays, request)`                                                 |
| `RxForwardReq` / `RxBackwardReq`                                                    | `RxReq`                                                                                                  |
| `{ strategy: "oneshot" / "forward", filters }`                                      | `RxReq` または `readonly LazyFilter[]`                                                                   |
| `RxBackwardReq.over()`                                                              | 存在しない。`RxReq.dispose()` による source completion と、query subscription の寿命を区別する必要がある |
| 配布 README の `createRxNostr` / `createRxForwardReq` / `verifier` / `seckeySigner` | 現行 root exports と一致しない                                                                           |

root README、配布 README、日本語 v4 docs の間にも異なる世代の API が混在している。導入例をそのまま利用できない。`getting-started`、`operators`、`relay-management`、`dispose` にも旧 query 記述が波及している。

修正・回帰試験: 現行 API を基準に全 v4 サンプルと両 README を一括更新する。`forward` の source を dispose しても最後の segment は継続し、`backward` は active / queued segment を完了させてから終わる、という現行テストの契約も説明する。主要コードブロックを実際の package import で型検査する。Changeset `tidy-badgers-smile.md` の descriptor 記述も更新対象である。

### F04 — WASM パッケージの型を NodeNext で解決できない

根拠: [crypto-wasm/package.json](packages/crypto-wasm/package.json) 22〜29 行。

トップレベルに `types: "./dist/index.d.ts"` はあるが、`exports["."]` に `types` 条件がなく、JS ファイル名も `index.js` ではない。ビルド後、独立した consumer で次を実行すると WASM の import だけ TS7016 になった。

```sh
tsc check.mts --noEmit --strict --skipLibCheck \
  --target esnext --module nodenext --moduleResolution nodenext
```

エラーは「`dist/index.d.ts` は存在するが、package.json の exports を尊重すると解決できない」と明示する。JS の import 成功や package 自身の build 成功では検出できない。

修正・回帰試験: 他の 2 パッケージと同様に exports に型の経路を追加する。packed package を別プロジェクトへ導入し、NodeNext と Bundler の consumer 型検査、JS import を確認する。WASM の `files` は test ファイルの除外も他パッケージと異なるため、tarball 内容を併せて確認する。

### F05 — legacy `cast()` が未送信で成功する

根拠: [legacy/client.ts](packages/rx-nostr/src/legacy/client.ts) 250〜330 行。

`completeOn: "sent"` は `publication.event` の resolve を送信完了として扱う。しかし、この Promise が示すのは署名結果の準備である。続く `finish()` は `publication.cancel()` を呼ぶ。

制御した未接続 socket を使い、`await legacy.cast(event)` が resolve した後も送信数が 0 で、socket の close が要求されることを確認した。呼び出し側は送信成功と解釈するが、EVENT は一度も送られていない。

修正・回帰試験: 署名完了と transport への送信完了を別の事実として扱う。legacy に必要な送信完了通知を内部 API に用意するか、この機能の契約を再設計する。未接続・接続済み・送信失敗・複数リレーで、`cast` / `completeOn: "sent"` が実際の EVENT 送信を待つことを検査する。

### F06 — legacy AUTH adapter が class のメソッドを失う

根拠: [legacy/adapters.ts](packages/rx-nostr/src/legacy/adapters.ts) 9〜12 行、[legacy/client.ts](packages/rx-nostr/src/legacy/client.ts) 74〜83 行。

`{ ...authenticator, authTimeout: ... }` は prototype 上の `challenge()` をコピーしない。`new SimpleAuthenticator(...)` を adapter に渡すと、元の `challenge` は function、変換後は undefined になることを確認した。`authTimeout` を指定しただけで、認証が callback error になる組み合わせがある。

修正・回帰試験: `challenge: (relay, challenge) => authenticator.challenge(relay, challenge)` のように元の object へ明示的に委譲する。class、object literal、factory が返す class、それぞれの `this` と timeout 優先順位を検査する。

### F07 — URL 正規化が query 値を変更する

根拠: [relay-urls.ts](packages/rx-nostr/src/libs/relay-urls.ts) 334〜357 行。

query 全体への `decodeURIComponent()` の結果を `URL.search` へ戻すため、値の中のエンコード済み区切りが query の構造になる。ビルド成果物で次を確認した。

```text
入力: wss://relay.example?token=a%26b%3Dc
出力: wss://relay.example?token=a&b=c
元のパラメータ: token = "a&b=c"
変換後: token = "a", b = "c"
```

接続先の認証パラメータや relay の識別を変えてしまう。これは単なる表記の統一ではない。

修正・回帰試験: query のエンコードを保持する。`&`、`=`、`+`、`%`、Unicode、同名パラメータのケースで `new URL(input).searchParams` の値が維持されることを検査する。既存 URL テストは単純なパラメータのソートだけを確認している。

### F08 — 0 の時刻境界を保持しない

根拠: [lazy-filter.ts](packages/rx-nostr/src/lazy-filter/lazy-filter.ts) 16〜21 行、[filter.ts](packages/rx-nostr/src/libs/nostr/filter.ts) 46〜56 行。

`evalFilters([{ until: 0 }])` は `until: undefined` になる。さらにローカル matching は `if (filter.until && ...)` なので、`created_at: 1` の EVENT が `{ until: 0 }` に一致すると判定される。`until: () => 0` は wire 上の値を保持しても matching 側で無視される。`since: 0` と exclusive option にも同種の問題がある。

修正・回帰試験: 値の有無を truthiness ではなく undefined との比較で判定する。0、正数、lazy function の各形式について、wire 上の filter と受信時の境界判定を確認する。

### F09 — filter の入力形式で意味が変わる

根拠: [RxNostr](packages/rx-nostr/src/rx-nostr/rx-nostr.ts) 120〜125 行、[RxReq](packages/rx-nostr/src/rx-req/rx-req.ts) 18〜22 行、[normalize-filters.ts](packages/rx-nostr/src/rx-req/normalize-filters.ts)。

static array はそのまま使われる一方、`RxReq.emit()` だけが正規化される。`emit({ authors: [] })` が `{ filters: [{}] }` を通知することを確認した。`kinds: []` なども制約が消える。static array では同じ空配列が残り、ローカル matching では一致しない。`since > until` などの処理にも差がある。

空の条件配列を許容するかは仕様決定が必要だが、型で渡せる入力が一方では全件に拡大するのは危険である。[NIP-01 の filter 定義](https://github.com/nostr-protocol/nips/blob/master/01.md#from-client-to-relay-sending-events-and-creating-subscriptions) はリストに値があることを前提としており、不正な条件を削除して全件化する根拠にはならない。

修正・回帰試験: 正規化・拒否・空結果のどれを採用するかを API 境界で統一する。同じ filter を static / emitted の両形式で入力し、wire・matching・completion が一致することを検査する。

### F10 — 同一時刻の EVENT の tie-break が逆

根拠: [event.ts](packages/rx-nostr/src/libs/nostr/event.ts) 55〜65 行、[latest.ts](packages/rx-nostr/src/operators/event-packet/latest.ts)、[timeline.ts](packages/rx-nostr/src/operators/event-packet/timeline.ts)、[operators docs](packages/docs/ja/v4/operators.md)。

`compareEvents()` は同じ時刻で小さい ID を「古い」側に置くため、`latest()` / `latestEach()` / `laterEvent()` は大きい ID を選び、`timeline()` も大きい ID を先頭に置く。同一 `created_at` の `a...a` と `b...b` で再現した。

docs は `latest()` を NIP-01 順序と説明するが、[NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) は同一時刻の replaceable event では小さい ID を保持し、初期結果の同時刻の並びでも小さい ID を優先する。kind 0 の最新 metadata などで期待と異なる値を残す。

修正・回帰試験: comparator の方向と「latest」の定義を統一し、同時刻の両到着順を検査する。現在の `latestEach` テストは timestamp が異なるケースのみである。

### F11 — Worker verifier の dispose 後に Promise が残る

根拠: [worker-verifier.ts](packages/rx-nostr/src/event-verifier/worker-verifier.ts) 57、120〜142、153〜164 行。

`dispose()` は worker と timer を止めるが、`#resolvers` 内の進行中リクエストを resolve/reject しない。active 状態で検証を開始し、応答前に dispose した場合、設定した timeout より長く待っても Promise は pending のままだった。応答も timeout も到来しなくなるため、検証を直接待つ利用側が終了できない。

修正・回帰試験: reject も保持し、dispose 時に全 pending request を終了して Map / callback queue を解放する。未完了検証を複数持つ状態での dispose、worker error、postMessage の同期例外を検査する。

### F12 — Worker verifier の timeout は設定値どおりではない

根拠: [worker-verifier.ts](packages/rx-nostr/src/event-verifier/worker-verifier.ts) 169〜197 行。

`Batch` は callback を `takeNext` へ追加し、最初の interval で `fireNext` に移し、次の interval で実行する。生成直後に `timeout: 100` で開始した検証は 100 ms では pending、200 ms で reject した。追加時点により待ち時間は約 1〜2 interval になる。

修正・回帰試験: request ごとの deadline または deadline を確認する共有 timer を使う。interval 直前・直後に開始したリクエストが、同じ timeout 契約で終了することを確認する。粗い deadline を意図するなら、option の意味を文書化する必要がある。

### F13 — Worker 経由だけ verifier 例外が隠れる

根拠: [worker-verifier.ts](packages/rx-nostr/src/event-verifier/worker-verifier.ts) 35〜41、92〜95 行、[signer/verifier docs](packages/docs/ja/v4/signer-verifier.md)。

Host は例外を `{ reqId, ok: false, error }` として返すが、Client は `error` を読まず `false` として resolve する。この response を渡す再現試験でも `false` になった。通常の verifier 例外は query の `RxNostrCallbackError` になる契約なので、Worker へ移しただけで処理障害が「不正署名」の黙示的な破棄に変わる。

修正・回帰試験: 検証結果 false と verifier 実行失敗を protocol 上で区別し、後者は reject する。直接・fallback・Worker の 3 経路で例外処理が一致することを確認する。

### F14 — 派生 RxReq の dispose が stream に作用しない

根拠: [rx-req.ts](packages/rx-nostr/src/rx-req/rx-req.ts) 9〜10、25〜35 行。

`pipe()` は新しい `RxReq` を生成してから `stream` を親の Subject に置き換える。しかし、その新しい stack に登録された Subject は置き換え前のものである。`piped.dispose()` 後に親から emit すると、piped の observer に next が届き、complete されないことを確認した。

親の共有 source を止めない設計自体は妥当だが、派生 object 自身の dispose が無効なのは lifecycle API として一貫しない。親・派生 object・各 subscription の所有権を明確にし、派生 stream だけを終了する仕組み、または disposal を持たない view とする設計が必要である。

回帰試験: 派生だけ dispose、親だけ dispose、兄弟の派生、同じ request の複数 subscriber、operator が timer を持つ場合を確認する。

### F15 — 英語 v4 が空のまま公開される

根拠: [英語 v4](packages/docs/en/v4/) の 14 Markdown ファイルはすべて空白のみ。[content.ts](packages/docs/.vitepress/content.ts) は v4 ナビゲーションを定義し、[config.mts](packages/docs/.vitepress/config.mts) は英語にもこれを適用する。

docs build は成功するため、空ページのまま公開できてしまう。翻訳を完成させるか、英語 v4 には未提供の案内と日本語版への導線を用意する。言語ごとのサイドバー項目が非空ページへ到達する検査を追加する。

### F16 — runtime の必須機能が明示されていない

根拠: [rx-disposable-stack.ts](packages/rx-nostr/src/libs/rxjs/rx-disposable-stack.ts) 5 行、[rx-relays.ts](packages/rx-nostr/src/rx-relays/rx-relays.ts)、[relay-urls.ts](packages/rx-nostr/src/libs/relay-urls.ts)、[installation docs](packages/docs/ja/v4/installation.md)、[package.json](packages/rx-nostr/package.json)。

`DisposableStack` を module 評価時に継承し、Set の集合演算や `toSorted()` も利用する。`DisposableStack` がない環境を再現して dist を import すると、client 構築前に `Class extends value undefined...` で失敗した。polyfill は devDependency とテスト側にあり、本体の配布物が補完するわけではない。

これは Node 24 で失敗するという指摘ではない。対応 runtime の下限が未定義なまま、導入 docs が WebSocket 注入だけを説明している点が問題である。最低 runtime / browser 条件、必要な polyfill と読み込み順を明記する。サポート対象の最小環境で bare import と最小通信を検査する。

## 公開 API の総合評価

`forward` / `backward` / `publish` を relay-first で揃え、query は cold、publication は hot とした現行 API は理解可能である。`IRxNostr` が private field を持つ実装クラスから独立している点、AUTH を明示的に設定する点、既定 verifier が未検証イベントを受理しない点、constructor / instance / operation / packet の設定段階を分けた点は妥当である。

一方、F01・F02 の検証と結果の所有権、F08・F09 の入力経路、F11〜F14 の lifecycle は、利用者から見える契約が揃っていない。以下も公開時に明文化すべきである。

| 項目                                     | 評価・改善事項                                                                                                                                                                         |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RxNostrReqConfig` / `RxNostrReqOptions` | 区別は実装内では成立するが、verifier は config のみ、signer は publish options にもあり非対称。直ちに rename する必要はないが、default に指定できる範囲を表で示すとよい                |
| `IRelayDirectory`                        | 公開 interface はあるが、`RxNostrConfig.relayDirectory` は concrete `RelayDirectory` を要求する。独自実装を注入できる interface と誤解させないこと                                     |
| 数値 option                              | connectionTimeout は厳密に検査される一方、REQ/publish timeout、linger などには `NaN` を無期限と同様に扱う分岐がある。許容する 0 / Infinity / 負数 / NaN / timer 上限超過の規則を揃える |
| 公開 utility                             | `ensureEventFields()` は tag 内の非 object 値を広く許容し、厳密な EVENT schema validator ではない。型 guard と暗号検証それぞれの責務・保証を明記する                                   |
| 名前とコメント                           | ReqPacket の「null で suspend」、NoopSigner の旧 factory 名を含むエラーなど、現行 API と一致しないコメントが残る                                                                       |
| legacy                                   | `rx-nostr/legacy` を配布する以上、独立した公開 API として保証範囲の文書とテストが必要。現行 migration guide はこの入口を説明しない                                                     |

version がまだ 3.x であることや crypto の peer が `~3` であることだけは、今回の確定不具合には数えない。Changesets の実際の release plan は 3 パッケージとも 4.0.0 を算出した。ただし version 適用後の peer range、crypto の API 変更に対する changelog、tarball の内容は公開直前の別検証が必要である。

## 内部設計と責務分離の評価

| 層                                                | 主な責務                                                     | 評価                                                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `RxNostr`                                         | defaults、operation の組み立て、所有する操作の終了           | 概ね適切。relay-local protocol を直接処理していない                                                                                      |
| query / `PublicationOperation`                    | 複数リレーへの操作、結果集約、操作の寿命                     | 分割は妥当。ただし F02 の内部状態と observer 通知、F05 の署名と送信の区別が崩れている                                                    |
| `ConnectionDemandScope` / lease                   | prewarm、weak、linger、接続需要の共有                        | protocol 処理から分離され、単体・契約テストもある                                                                                        |
| `RelayCommunication`                              | relay ごとの executor / scheduler / directory / lease の構成 | 小さな構成用 facade として妥当                                                                                                           |
| `NostrOperationExecutor` / `AuthCoordinator`      | REQ/EVENT、AUTH と再送、接続単位の認証共有                   | AUTH の単一 challenge 所有と stale な署名の無効化は良い設計                                                                              |
| `RelayReqScheduler`                               | max_subscriptions、queue、CLOSE 後の slot 解放               | transport / 認証 / 接続需要を所有せず、責務が明確                                                                                        |
| `NostrTransport` / `ConnectionAttemptCoordinator` | unipls adapter、接続状態、再試行と抑止の調整                 | Coordinator の分離は有効。transport は約 950 行あり、変換 helper と lifecycle の見通しは改善余地があるが、行数だけで不適切とは判定しない |
| `RelayDirectory` / `RelayRecord`                  | metadata、health、snapshot、共有 probe                       | 公開 copy と内部 record の分離、snapshot の事前検証は妥当                                                                                |
| Worker verifier / legacy adapter                  | runtime 分離・互換 API 変換                                  | 中核に比べて責務境界とテストが弱く、今回の問題が集中している                                                                             |

優先して改善すべき設計点は次のとおり。

1. **公開 object の所有権を一つの規則にする。** Directory、connection state、publication.event では copy 方針があるのに OK では共有される。内部の immutable 値と利用者向け mutable 値をどこで分けるか、共通ルールにする。
2. **完了の種類を区別する。** 署名完了、送信完了、relay の受理、観測終了、source 完了、resource 解放は異なる。F05 と F14 はこの違いが adapter / 派生 object に正しく反映されていない例である。
3. **入力正規化を operation の入口へ寄せる。** static / RxReq、crypto 通常版 / WASM 版で、それぞれ同じ契約を持つべき処理の経路が異なる。共通ベクタまたは共通の境界処理を用意する。
4. **Directory の拡張可能性を正直に表す。** `getRelayDirectoryReporter()` は concrete instance を WeakMap で認識する。public reader interface と内部 health writer を分ける意図は妥当だが、構造的な独自実装の injection とは両立していない。必要なら reader / reporter の明示的な内部 port を設ける。

大規模な再設計を公開条件にする必要はない。まずは現在の層構造のまま、上記の責務境界を正しく守る修正を優先できる。

## テストシナリオの正確性

中核の contract テストは、公開 API から制御 socket へ実際の REQ / EVENT / CLOSE / AUTH を流して観測している。再接続、NIP-11 queue、弱い接続需要、複数リレーの失敗分離、challenge 差し替え、static defaults、dispose の検査は価値が高い。queue inspector 自体に timeout とテストがあり、単に「テストが終わった」ことを成功とする構造でもない。型の `expectTypeOf` は通常の Vitest 実行だけでは十分でないが、rx-nostr build の typecheck がテストソースも対象にしているため、この点は補完されている。

問題は、既存の期待値が全面的に誤っていることではなく、**テストが保証している範囲より公開契約が広い**ことである。

| 領域         | 現在のシナリオ・不足                                     | 必要な追加検証                                                                                 |
| ------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 暗号         | 正常例とフィールド欠落を中心に検査                       | ID/content/pubkey/sig を個別改変し、通常/WASM の同じ期待値で検査                               |
| Public entry | alias で src を import。legacy spec も相対 source import | tarball を使用する root / operators / utils / legacy / crypto の runtime と型 consumer         |
| docs         | VitePress の生成のみ                                     | README、getting-started、query、publish、AUTH の実行可能な型検査用サンプル                     |
| publication  | 集約・replay・event snapshot は検査                      | observer の破壊的変更と同期的な再入、OK のコピー、late observer                                |
| legacy       | `legacy.spec.ts` は readable relay の `use()` 1 ケース   | cast/send の送信完了、AUTH class/factory、timeout、read/write/additional relay、複数 subscribe |
| filter       | 代表的な matching・verifier・expiration の順序を検査     | 0、空配列、逆転時刻、static/emitted 同値性、lazy の再評価                                      |
| operators    | latestEach の異なる時刻等、4 ケース                      | 同時刻の ID 優先順、limit 境界、batch/chunk の packet option 保持                              |
| Worker       | 専用テストが見当たらない                                 | lifecycle、deadline、Host 例外、fallback、worker error、postMessage 例外、実 Worker smoke test |
| RxReq        | emit/pipe/継承の値の通知                                 | 派生 source の dispose と operator timer、親/兄弟/subscriber の独立性                          |
| URL          | slash、alias、単純 query ソート                          | エンコード済みの query 値の保持                                                                |
| runtime      | Node 24 と test polyfill                                 | 対応最低 runtime で polyfill なし/ありの bare import                                           |

テスト補助の `createRxNostrScenario()` は既定で NoopVerifier、NoopReconnector、`skipFetchNip11: true` を注入する。これは protocol lifecycle を独立して検証するためには妥当だが、暗号・既定再試行・自動 metadata 取得が一緒に働く保証にはならない。別ファイルでの個別テストに加え、実際の signer/verifier を通す少数の統合シナリオを追加するとよい。

また `query.spec.ts` の「fixed forward descriptor」というテスト名は、現在は配列を使っており旧用語が残る。テスト名・docs・公開型が同じ契約を指すように揃える必要がある。F14 のような寿命の問題では、値が届くことだけでなく「以後届かない」「完了した」「timer が残らない」まで検査する。

## 公開前の完了条件

1. F01、F02、F05 を修正し、署名/ID、成功判定、送信完了の回帰テストを追加する。
2. F03、F04 を解消し、導入サンプルと独立 consumer の型検査を通す。
3. F06〜F14 の対象機能について修正と契約確定を行い、本文の境界条件をテストする。
4. 英語 v4 の提供方針と runtime の下限を決定し、docs に反映する。
5. Changesets の version 適用後、全 public package の peer・exports・型・README・tarball を独立 consumer で確認する。その後、既存 test/build/docs/lint を再実行する。

今回の一時的な再現テストは source tree から取り除き、`/tmp/rx-nostr-audit-reproductions.test.ts` に保存した。実行ログは `/tmp/rx-nostr-audit-repros.log`、既存 rx-nostr テストの JSON 集計は `/tmp/rx-nostr-audit-test-results.json`、consumer 型検査の結果は `/tmp/rx-nostr-audit-consumer.log` にある。これらはローカル調査用の一時ファイルであり、報告の根拠と再現条件は本文にも記載した。
