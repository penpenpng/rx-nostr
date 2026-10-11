# Connection Demand

接続需要は、ある relay への接続を必要としていることを表します。同じ `RxNostr` 内の query、publication、hot relay が持つ需要は relay ごとに共有され、最後の需要が解放されると接続や再接続待機を終了します。ひとつの operation が終わっても、別の需要があれば接続を維持します。

v4 では、operation の宛先と WebSocket 接続の寿命を別々に指定します。

- `relays` — REQ または EVENT を実際に送る宛先
- hot relay — operation がなくても接続を維持する集合
- `defer` / `weak` / `linger` — operation が接続需要を作る方法

hot relay は宛先ではありません。hot に設定しただけでは REQ や EVENT は送信されません。

## Hot relay の需要

hot relay は集合に含まれる間、長寿命の接続需要を保持します。query や publish の `linger` が終了しても、hot の需要が残っていれば WebSocket は閉じません。登録方法は [Hot Relays](./hot-relays) を参照してください。

## 接続需要 option

### `defer`

REQ 専用の option です。既定値は `true` で、最初の ReqPacket が emit されるまで接続しません。`false` にすると query を subscribe した時点で宛先を prewarm します。

固定の filter 配列を渡す場合は subscribe 時にその filter が供給されるため、`defer: true` でも別途 `emit()` を待つことはありません。

### `weak`

既定値は `false` です。`true` の operation は新しい接続需要を作らず、hot relay や別の operation によって既に利用可能な接続だけを使います。切断中の relay に weak operation だけを指定しても接続は開始されません。

### `linger`

segment 終了後も接続需要を保持する時間です。既定値は 10,000 ms です。

- `0` — 終了後すぐ解放
- 正の有限値 — 指定時間だけ再利用可能な状態を維持
- `Infinity` — operation/session が dispose されるまで保持

正の有限値は最大 2,147,483,647 ms です。不正な値は [時間値の許容範囲](./configuration.md#時間値の許容範囲) の規則で拒否します。

`RxNostr.dispose()` と `Publication.cancel()` は linger を待たずにリソースを解放します。

## 設定する単位

`defer` は query の option、`weak` と `linger` は query / publish の option です。`defaultOptions.req` / `defaultOptions.publish` に既定値を指定でき、`RxReq.emit()` の `linger` はその REQ segment の値を上書きします。

```ts
rxNostr.forward(relays, request, {
  defer: false,
  weak: false,
  linger: 5_000,
}).subscribe(console.log);

request.emit([{ kinds: [1] }], { linger: 0 });
```

`weak: true` の場合は `defer: false` を指定しても接続需要を作りません。需要があっても、接続失敗時の再試行方針や relay health による抑止は適用されます。詳しくは [Reconnection](./reconnection) を参照してください。
