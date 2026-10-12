# Hot Relays

`setHotRelays()` は、指定した relay 集合について接続需要を登録する操作です。`setHotRelays()` 自体は REQ や EVENT を発行せず、operation の宛先も設定しません。需要に応じた接続の開始・維持・終了は接続プールが管理します。

## 登録と解除

頻繁に使うリレーへあらかじめ接続しておくには `setHotRelays()` を使います。

```ts
const hot = new RxRelays(["wss://relay.example.com"]);
rxNostr.setHotRelays(hot);

hot.append("wss://another.example.com");

// hot relay として登録した接続需要をすべて解放します。
rxNostr.unsetHotRelays();
hot.dispose();
```

`setHotRelays()` を再度呼ぶと登録集合を置き換えます。`RxRelays` を渡すと集合の変更に追従し、`unsetHotRelays()` はその登録を空にします。別の operation が持つ需要まで解除する操作ではありません。

接続需要の共有、`linger`、`weak`、接続が維持される条件は [Connection Demand](./connection-demand) を参照してください。接続の抑止や再接続待機がある場合は、登録直後に接続済みになるとは限りません。
