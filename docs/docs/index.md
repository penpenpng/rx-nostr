# Overview

rx-nostr は [Nostr](https://nostr.com/) アプリケーションがリレーとより簡単に通信するための [RxJS](https://rxjs.dev/) に基づくライブラリです。Nostr アプリケーションの開発者が考慮を迫られる以下のような煩わしい課題を肩代わりし、開発者がアプリケーションロジックに集中する手助けをします。

- **REQ サブスクリプションの管理**: REQ の確立および更新、あるいは自動的な CLOSE を初めとした REQ サブスクリプションの管理を簡潔なインターフェースで実現します。
- **リレープールの管理**: リレーの集合をリアクティブに扱います。リレーの増減や Read/Write 設定の変更といったリレー構成の変化に反応して、新しいリレー構成のもとで現在アクティブな REQ を適切に再構成します。
- **WebSocket 接続の管理**: WebSocket の自動再接続と、それに伴う必要に応じた REQ の再発行を行います。接続状態の変化を購読することも可能で、アプリケーションが接続しているリレー集合のヘルスステータスを簡単に確認できるようにします。

rx-nostr を使うと、例えば kind1 のイベントを購読するコードは以下のように簡潔に実現できます。なお、これと同等のコードの説明は [First Step](/docs/first-step.md) で詳述します。より複雑な例は [Examples](/docs/examples.md) で見ることができます。

```js
import { createRxNostr, createRxForwardReq } from "rx-nostr";

const rxNostr = createRxNostr();
rxNostr.switchRelays(["wss://nostr.example.com"]);

const rxReq = createRxForwardReq();

rxNostr.use(rxReq).subscribe((packet) => {
  console.log(packet);
});

rxReq.emit([{ kinds: [1] }]);
```

また、rx-nostr は RxJS 以外のフレームワークに依存しません。これは rx-nostr を任意のフロンエンドフレームと組み合わせて Web フロントエンドアプリケーションに利用することも、あるいは任意の Node.js ライブラリと組み合わせて bot や CLI アプリケーションを構築することも可能であることを意味します。

::: tip Note
本ドキュメントは Nostr と RxJS に関する基本的な知識を前提として記述されます。これらについて馴染みのない方は先に次に挙げる資料に目を通すことをおすすめします。

- [NIPs](https://github.com/nostr-protocol/nips) の特に [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md)
- [RxJS Introduction](https://rxjs.dev/guide/overview)

:::
