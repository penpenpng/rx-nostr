# Read Events

rx-nostr では EVENT メッセージの購読戦略として Forward 戦略と Backward 戦略の2つを用意しています。端的には、前者は未来のイベントの取得に、後者は過去のイベントの取得に使います。未来のイベントも過去のイベントも取得したい場合は、2つの戦略に分けて取得してください。

## 共通設計

冒頭で触れた2つの戦略に対応した `forward()`, `backward()` メソッドがそれぞれ利用可能です。目的と裏側のアルゴリズムが異なりますが、引数と返り値の型を始めとして使用方法はほぼ共通しているので `forward()` を例にとって共通部分について先に説明します。

各メソッドは引数として [Relay Input](./relay-input.md), **REQ Input** を取り、 **Observable** を返します。REQ Input とはリレーに送信する REQ の内容とタイミングを指定するもので、このあとすぐ説明します。一方 Observable とは `subscribe()` によって購読可能なオブジェクトで、[RxJS の Observable](https://rxjs.dev/guide/observable) とまったく同一のものです。これも後で [Observable と Subscription](#observable-%E3%81%A8-subscription) で詳しく説明します。

```ts
const sub = rxNostr
  // Relay Input, REQ Input を取る
  .forward(relays, reqs)
  .subscribe(() => {
    // subscribe によって購読する
  });
```

::: warning

技術的には同一 Observable に対して2個所以上で同時に `subscribe()` することが可能ですが、同一の REQ メッセージが購読数と同じだけ送信されてしまいます。通常これは望ましくないためそのような利用は避けるか、どうしても必要な場合には [`share()` operator](https://rxjs.dev/api/index/function/share) を使用してください。

```ts
import { share } from 'rxjs';

const sharedObservable = rxNostr.forward(relays, reqs).pipe(share());

// 2個所で同時に subscribe されても同一の REQ メッセージはひとつだけ送信される
sharedObservable.subscribe(() => { /* ... */ })
sharedObservable.subscribe(() => { /* ... */ })
```

`share()` された Observable を後から購読した場合、先の購読者がすでに受信しているメッセージは後の購読者には届かないことに注意してください。もしも後の購読者も先行したメッセージを受信したい場合には [`shareReplay()` operator](https://rxjs.dev/api/index/function/shareReplay) の利用を検討してください。

:::


### 静的な REQ Input

REQ Input は静的形式と動的形式の2種類があります。静的形式は単なる REQ フィルターの表現です。静的形式で指定した場合は、Observable が `subscribe()` されたときに実際の REQ メッセージが送信されます。

```ts
// 単一フィルター
const obs1 = rxNostr.forward(relays, { kinds: [1] });

// 複数フィルター (REQ メッセージ自体は単一であることに注意)
const obs2 = rxNostr.forward(relays, [{ kinds: [1] }, { authors: [me] }]);

// 複数メッセージ (backward でのみ有効)
const obs3 = rxNostr.backward(relays, [
  [{ kind: [1], limit: 10 }],
  [{ kind: [2], limit: 10 }],
  [{ kind: [3], limit: 10 }],
]);

// 上記のいずれも REQ メッセージはまだ送信されていない。
// `subscribe()` されたときに初めて REQ メッセージが送信される。
obs1.subscribe();
obs2.subscribe();
obs3.subscribe();
```

### 動的な REQ Input

動的形式では **RxReq** インスタンスを指定します。動的形式で指定した場合、`subscribe()` された Observable に対してリクエストが到達したときに初めて実際の REQ メッセージが送信されます。

動的形式の REQ Input では、メソッドに対して複数の REQ フィルターを異なるタイミングで送信できます。これが実際にどのような振る舞いに繋がるのかは戦略によって異なります。

```ts
const reqs = new RxReq();

rxNostr
  .forward(relays, reqs)
    .subscribe(() => {
    // ...
  });

// この瞬間に初めて REQ メッセージが送信される。
// `emit()` するより前に `subscribe()` が開始されていなければならない。
reqs.emit({ kinds: [1] });

// 複数回 `emit()` することができる。
reqs.emit({ kinds: [2] });
```

### Observable と Subscription

rx-nostr を利用するうえで RxJS について熟知している必要はありませんが、Observable と Subscription に関して最低限のことを知っておく必要はあります。

[Observable](https://rxjs.dev/guide/observable) は `subscribe()` によって購読可能なオブジェクトで、購読によって3種類のコールバックを登録することができます。

```ts
observable.subscribe({
  next: () => {},     // Observable が値を発行するたびに何度でも呼ばれる
  complete: () => {}, // Observable が完了したとき1度だけ呼ばれる
  error: () => {},    // Observable がエラー終了したとき1度だけ呼ばれる
});

// `next` だけ登録するときにはショートハンドが利用可能です
observable.subscribe(() => {});
```

`subscribe()` は [Subscription](https://rxjs.dev/guide/subscription) を返します。これは `unsubscribe()` 可能なオブジェクトです。

不要になった購読は、それが完了もエラー終了もしていないのであれば `unsubscribe()` されなければなりません。未完了の購読が放置されるとメモリリークの原因になります。

なお、`unsubscribe()` は購読の終了であり Observable の完了とは区別されます。したがって `complete` コールバックを呼び出しません。もし購読の終了に対してコールバックを登録したいなら [`finalize()` operator](https://rxjs.dev/api/operators/finalize) が便利です。

```ts
const sub = rxNostr.forward().subscribe();

// 不要になった購読は必ず unsubscribe する
sub.unsubscribe();
```

::: tip Note

複数の購読のライフタイムをまとめて管理するには `RxDisposableStack` メソッドが便利です。これは Subscription を初めとした RxJS リソースも扱えるよう拡張された [DisposableStack](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DisposableStack) です。

```ts
import { RxDisposableStack } from 'rx-nostr/utils';

const stack = new RxDisposableStack();

stack.add(
  rxNostr.forward().subscribe();
);

// stack に登録されたすべてのリソースが解放される
stack.unsubscribe();
```

:::

## 未来のイベントを購読する

Forward 戦略はこれから発行されるであろう未来のイベントを待ち受けるための戦略で、`forward()` メソッドで利用できます。確実に未来のイベントを購読するため、`since: now` を設定するべきです。詳しくは [Lazy Filter](./reconnection.md#lazy-filter) を参照してください。

```ts
import { now } from 'rx-nostr/utils';

rxNostr.forward(relays, { kind: [1], since: now });
```

### 動的な REQ Input

動的な REQ Input によって新しい REQ 要求が送信されると、その REQ 要求は **古い REQ を終了させ、置き換えます**。つまり、Forward 戦略においては、あるリレーに対して同時に確立される REQ 要求の数は最大で1つまでです。

### 動的な Relay Input

動的な Relay Input が与えられると、リレー集合の変更に反応して宛先リレーが動的に変更されます。

### 購読の終了

Forward 戦略では基本的には明示的に `unsubscribe()` されるまで購読が継続します。ただし、以下の場合には購読が終了し、リレーに CLOSE メッセージが送信されます。

* 明示的に `unsubscribe()` される
* NIP-42 AUTH 要求以外の理由で CLOSED メッセージを受け取る
* クライアントが明示的に `dispose()` される

いずれかのリレー上で購読が終了したとしても、ほかのリレー上の購読もまとめて終了するわけではありません。

### Observable の complete

Observable が complete するのは、クライアントが明示的に `dispose()` されたときだけです。すべてのリレー上での購読が終了したとしても、Observable が自動で complete することはありません。

## 過去のイベントを取得する

Backward 戦略は既に発行された過去のイベントを取得するための戦略で、`backward()` メソッドで利用できます。Backward 戦略はリレーから EOSE が返ってくることを期待して動作するため、 `limit` や `since`, `until` をレスポンスが有限個になるように調整するべきです。

```ts
import { now } from 'rx-nostr/utils';

rxNostr.backward(relays, { kind: [1], until: now, limit: 10 });
```

::: tip Note

過去のイベントを要求することは意味上は購読というよりは取得に近いので、すべてのイベントの取得を待ちたくなるかもしれません。しかし、可能ならばレスポンスを逐次的に処理した方がアプリケーションのパフォーマンスを高めることができます。

なぜなら、リレーに対して過去のイベントを要求したときであっても、レスポンスは一度にまとめて送られてくるとは限らないからです。多くの場合は逐次的にレスポンスが届き、その時間間隔はまばらです。特に時間的に広い範囲のレスポンスを要求したときにはレスポンス間の時間間隔は大きくなる傾向があります。

:::

### 動的な REQ Input

動的な REQ Input によって新しい REQ 要求が送信されると、その REQ 要求は **古い REQ と並列に実行されます**。

### 動的な Relay Input

動的な Relay Input が与えられると、リレー集合の変更に反応して **次回以降の** 宛先リレーが変更されます。

### 購読の終了

Backward 戦略では、リレーから EOSE メッセージが届くとクライアントは自動で CLOSE メッセージを送信します。この動作はリレーに対する同時並行購読数を抑えるために役立ちます。

他にも以下の場合に CLOSE メッセージが送信されます。

* EOSE メッセージを受け取る
* EVENT メッセージを受け取れない状態が一定時間継続する
* 明示的に `unsubscribe()` される
* NIP-42 AUTH 要求以外の理由で CLOSED メッセージを受け取る
* クライアントが明示的に `dispose()` される

いずれかのリレー上で購読が終了したとしても、ほかのリレー上の購読もまとめて終了するわけではありません。

### Observable の complete

Observable が complete するのは、クライアントが明示的に `dispose()` されたときか、以下をすべて満たしたときです

* 静的形式で REQ Input が指定されている
* すべてのリレー上ですべての購読が終了した

## 一時的な宛先リレー

動的な REQ Input では、REQ 要求ごとに宛先リレーを上書きすることができます。これは、Relay Hint が与えられている状況で宛先リレーを一時的に指定したいときに便利です。

```ts
rxNostr.backward(relays, reqs).subscribe(() => {});

reqs.emit(
  { ids: [eventId], },
  { relays: 'wss://relay.example.com' },
);
```

## リクエストキュー

通常、リレーには同時並行できる REQ サブスクリプションの数に上限が設けられており、[NIP-11](https://github.com/nostr-protocol/nips/blob/master/11.md) に基づきその上限設定が公開されます。rx-nostr はこの情報を自動で読み取って、並行数の制限を逸脱しないように REQ 要求をキューイングします。

詳しくは [Relay Directory](./relay-directory.md) を参照してください。

## レスポンスの検査

rx-nostr は REQ の結果として返されるイベントのうち不適格と判断されるものを自動的にフィルターします。

### 署名検証

クライアントに渡された `verifier` を使用して自動で署名を検証し、検証に失敗したイベントを結果から除きます。この挙動は `skipVerify` オプションで無効にできます。

### Filter Validation

REQ の結果として返されたイベントが本当に REQ のフィルターに合致しているかを自動で検証し、検証に失敗したイベントを結果から除きます。この挙動は `skipValidateFilterMatching` オプションで無効にできます。

::: tip Note
`search` フィールドに対する標準化された解釈は存在しないため、同フィールドの検証は行われません。
:::

### 期限検証

[NIP-40](https://github.com/nostr-protocol/nips/blob/master/40.md) に基づいて、REQ の結果として返されたイベントが期限切れとなっていないかを自動で確認し、期限が切れているイベントを結果から除きます。この挙動は `skipExpirationCheck` オプションで無効にできます。
