# New Connection Strategy

- rxreq reusable flag
  - rxreq はデフォルトで使い切りということにしておいたほうがリソース開放忘れが減ってよさそう
  - rxrelay もデフォルトで使い切りの方が良さそう
    - つまり unsubscribe されたときに subject を complete する

* RxNostr === RelayPool になっているがやっぱ分離したほうがいい
  - RxNostr の破棄 を その上で行われている通信の終了
  - RelayPool の破棄 を その通信路の終了
  - とそれぞれ結びつけたい

## 改善したい点

- 一時リレーに対する接続戦略のカスタマイズ性が乏しい
- RxNostr インスタンスがデフォルトリレーの選択とコネクションプールの両方の役割を持ってしまっていたため、異なるリレーセットに対して同一のプールを使うことができない
- 「write relays から読む」や「read relays に書く」といった操作が必要な場面があるが、それを簡単に書く方法がない

## アイデア

- RxNostr はコネクションプールだけを持つようにする
- デフォルトリレーを一般化した RelayGroup クラスを用意する。`.use()` や `.send()` でこれを購読させ、特定のリレーグループに対してリアクティブな通信を行う。
- RxNostr インスタンスに対して定める `connectionStrategy` だけで表していた接続戦略を、`.emit()`, `.use()`, `.send()` ごとに定める `begin` と `lifetime` で表すようにし、表現力を高める
  - 実際の WebSocket 接続は、1箇所以上から **keep** されている間だけ確立するようにする
  - `keep` はいつ keep するかを定める
  - `release` はいつ release するかを定める
  - `.use()`
    - `keep: none` 既に確立されている接続の上でだけ通信する
      - `release: none` keep してないので release もしない
    - `keep: ondemand` emit 要求が来るまで keep を保留する
      - `release: emit`
      - `release: use`
      - `release: instance`
    - `keep: immediate` すぐ keep する
      - (`release: emit` はないので、)
      - `release: use`
      - `release: instance`
  - `.emit()` では `.use()` での設定を上書きできる
    - `keep: none`
      - `release: none`
    - `keep: immediate`
      - `release: emit`
      - `release: use`
      - `release: instance` は一応可能ではあるが意味あるか？
  - `.send()`
    - `keep: none`
      - `release: none`
    - `keep: immediate`
      - `release: send`
      - `release: instance`

実際には、

```ts
type KeepOption = "weak" | { begin: ""; while: "" }; // | ...

// 今までの default relay (aggressive) と同じ挙動をさせるには
rxn.use(rxq, [
  {
    relays: defaultReadRelayGroup,
    // あるいは relays: ["wss://..."],

    // connect だと誤解を招きそう (既に繋がっている場合にはその限りではないので)
    keep: {
      begin: "immediate",
      while: "instance",
    },
    // lazy      なら begin: "ondemand", while: "emit"
    // lazy-keep なら begin: "ondemand", while: "instance"
  },
]);

rxq.emit({}, [
  {
    relays: ["wss://..."],

    // begin は指定不可
    keep: { while: "emit" },
  },
]);
```

- instance オプションは取り回しが悪いので `.keep(rxr)` を提供し、ここにあるリレーには接続を維持するようにする？

- オプションが大きくなると面倒なのでデフォルトのオプションを設定できるようにしたい
- デフォルトのオプションを new RxNostr するたびに書くのもまた面倒なので、Config クラスを用意する？
  - 用意したところでユーザがやること一緒か

### 実装

- RelayPool は単なる `RelayMap<RelayCommunication>` でいい…？
  - どれくらい操作が複雑になるかわからないから下から書いて決めるか
- RelayCommunication が以下を備える
  - keep/release
    - シンプルな参照カウンタ
  - vreq
  - send
- vreq って lifetime に関する情報を持つべき？
  - RelayConnection が複数あるかもしれないなら、今この Connection を閉じていいかをどう判断する？
  - 呼び出し元が unsub すればいいだけでは？
  - じゃあそれで

```ts
export interface IRelayPool {
  keep(relays: string[], token: LifetimeToken): Observable<void>;
  vreq(relays: string[], params: VreqParams): Observable<EventPacket>;
  send(relays: string[], params: Nostr.EventParameters): Observable<OkPacket>;
}

export interface IRelayCommunication {
  keep(token: LifetimeToken): Observable<void>;
  vreq(params: VreqParams): Observable<EventPacket>;
  send(params: Nostr.EventParameters): Observable<OkPacket>;
}

export interface IConnection {}

export interface VreqParams {
  filters: LazyFilter[];
  strategy: "forward" | "backward";
  token: LifetimeToken;
}
```

### New Features

- createほげほげ 系のやつも一応残して deprecated にする
- send がキューできるとうれしいっぽい…？
  - transaction 的な。先の変更が反映されるのを待って～ みたいな感じで
- EOSE を明示的に待てると嬉しいことがありそう
- send の戻り値
  - unsubscribe は send の retry をキャンセルする。特定の場面まで待ちたい人のために、promise を返す operatorFactory を作る
    - `const {waiter, promise} = waiter()`
    - `.pipe(waiter())`
    - `await promise`
    - 必要なものは…
      - n 件の成功
      - すべての成功
- use されたときにその結果を RxReq 側で聞けると paging とかがやりやすいのでは
  - RxReq が複数の RxNostr から同時に聞かれたときの処理がややこしいから別のアプローチがいいか？
    - そんな使い方あるか？
  - 別のアプローチとしては
    - rxn.paginator(filter_without_since_until) の中で backward req を作って、.next, .prev などを含んだコントローラを返す
      - こっちのがいいな
      - ミュートとかで件数が減ったときにいい感じに補填するやつを書くためには pipe 先でどうなるか書けないといけない…
        - predicate 関数をもらって filter() だけは内側で噛ませるなどありえるが、verify や dropExpired などを使い回せないところが微妙なので、pipe を丸ごともらったほうがいいのかも…
    - こっちでやるほうがよさそうで、それなら後から追加できるから v4 のリリースに加えなくていい

### Documentation

- ja readme
- readme もうちょいいい感じにする
- locale ごとに ja/en を出し分けるやつ
- crypto, crypto-wasm はセクションを分ける
