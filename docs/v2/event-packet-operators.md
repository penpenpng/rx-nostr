---
sidebarDepth: 0
---

# EventPacket Operators

`rxNostr.use()` が返す `Observable<EventPacket>` に対して適用可能な Operator のリファレンスです。

[[TOC]]

## uniq()

`event.id` に基づいてイベントの重複を排除します。異なるリレーからもたらされた `EventPacket` であっても `event.id` が等しければ同一のイベントとみなします。

省略可能な `ObservableInput<unknown>` によって、内部のイベント ID の Set をフラッシュすることができます。

```ts
import { Subject } from "rxjs";
import { uniq } from "rx-nostr";

// ...

const flushes$ = new Subject<void>();

rxNostr
  .use(rxReq)
  .pipe(uniq(flushes$))
  .subscribe(() => {
    // ...
  });

// イベントID の Set をフラッシュする
flushes$.next();
```

## createUniq()

与えられた `keyFn` に基づいてイベントの重複を排除する Operator と、それに紐づくイベント ID の Set を返します。

省略可能な第二引数で、新しい Packet を観測するごとに呼び出されるコールバック関数を登録できます。

`uniq()` と異なり、フラッシュするには単に返り値の set を `clear()` します。

```ts
import { createUniq, type EventPacket } from "rx-nostr";

// イベントID に基づいて重複を排除する
const keyFn = (packet: EventPacket): string => packet.event.id;

const onCache = (packet: EventPacket): void => {
  console.log(`${packet.id} を初めて観測しました`);
};
const onHit = (packet: EventPacket): void => {
  console.log(`${packet.id} はすでに観測されています`);
};

const [uniq, eventIds] = createUniq(keyFn, { onCache, onHit });

// ...

rxNostr
  .use(rxReq)
  .pipe(uniq())
  .subscribe(() => {
    // ...
  });

// 観測済みのイベント ID をフラッシュする
eventIds.clear();
```

## tie()

異なるリレーからもたらされた同一のイベントをまとめ上げ、イベントごとにそれがどのリレーの上で観測済みかを `seenOn` に記録します。また、そのイベントが初めて観測されたものならば `isNew` フラグをセットします。

`uniq()` と同様に、省略可能な `ObservableInput<unknown>` によって、内部の Map をフラッシュすることができます。

```ts
import { tie } from "rx-nostr";

// ...

rxNostr
  .use(rxReq)
  .pipe(tie())
  .subscribe((packet) => {
    if (packet.isNew) {
      console.log(`${packet.event.id} は新しいイベントです`);
    }

    console.log(
      `${packet.event.id} は ${packet.seenOn.length} 個のリレーで観測されました`
    );
  });
```

## createTie()

`tie()` とほぼ同様の Operator と、それに紐づく Map を返します。Map の型は `Map<string, Set<string>>` で、キーはイベント ID、値はリレーの集合です。

`tie()` と異なり、フラッシュするには単に返り値の map を `clear()` します。

## latest()

過去に観測した中で最も新しい `created_at` を持つイベントのみ通し、それ以外を排除します。言い換えると、Observable を流れるイベントの時系列順序を担保できます。

## latestEach()

与えられた `keyFn` に基づいて、キーごとにもっとも新しい `created_at` を持つイベントのみ通し、それ以外を排除します。

ユーザごとの最新の kind0 を収集したいときなどに役立ちます。

## verify()

イベントの署名を検証し、検証に失敗したイベントを排除します。

通常、検証処理は rx-nostr によって自動で行われますが、`skipVerify` が有効になっている場合にはこの Operator が便利です。

## filterByKind()

与えられた kind のイベントのみ通し、それ以外を排除します。

## filterBy()

与えられたフィルターに合致するイベントのみ通し、それ以外を排除します。

省略可能な第二引数に `not` を指定すると、フィルター条件を反転させることができます。

リレーに対してはすべての kind1 を要求しつつ、クライアントサイドでそれらを細かく振り分けたい場合などに便利です。

```ts
import { share } from "rxjs";
import { filterBy } from "rx-nostr";

// ...

const kind1$ = rxNostr.use(rxReq).pipe(share());

kind1$.pipe(filterBy({ authors: USER_LIST_1 })).subscribe(() => {
  // ...
});
kind1$.pipe(filterBy({ authors: USER_LIST_2 })).subscribe(() => {
  // ...
});

rxReq.emit({ kinds: [1] });
```

::: warning
`search` フィールドと `limit` フィールドは無視されることに注意してください。
:::

## timeline()

`EventPacket` の Observable を `EventPacket[]` の Observable に変換します。変換後の各 `EventPacket[]` は、その時点での最新 `limit` 件のイベントです。

```ts
import { timeline } from "rx-nostr";

// ...

rxNostr
  .use(rxReq)
  .pipe(timeline(5))
  .subscribe((packets) => {
    console.log(`最新5件のイベントは`, packets);
  });
```

## sortEvents()

与えられた待機時間とソートキーに基づいて、可能な限り順序を保った Observable に変換します。

省略可能な第二引数でソートキーを設定できます。省略された場合は `created_at` に基づいて昇順にソートされます。すなわち、できる限り `created_at` の時間が前後しないような Observable が得られます。

```ts
import { sortEvents } from "rx-nostr";

// ...

rxNostr
  .use(rxReq)
  .pipe(sortEvents(3 * 1000))
  .subscribe((packet) => {
    // 3 秒遅延する代わりに、可能な限り順序通りのイベントを得る
  });
```

## dropExpiredEvents()

[NIP-40](https://github.com/nostr-protocol/nips/blob/master/40.md) に基づいてイベントが期限切れになっているかどうかを確認し、期限切れのイベントを排除します。

通常、この処理は rx-nostr によって自動で行われますが、`skipExpirationCheck` が有効になっている場合にはこの Operator が便利です。
