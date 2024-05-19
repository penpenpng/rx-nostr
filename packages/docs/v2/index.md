# Overview

rx-nostr は [Nostr](https://nostr.com/) アプリケーションがひとつまたは複数のリレーとの堅牢な通信を簡便かつ直感的に実現するためのライブラリです。rx-nostr は [RxJS](https://rxjs.dev/) で実装されており、RxJS の諸機能とのシームレスな連携が可能となるよう設計されていますが、RxJS との併用は必須ではありません。

Nostr アプリケーションの開発者は rx-nostr を利用することで、リレー通信に伴う以下のような煩わしい問題の存在を意識せず、[NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) に基づく publish/subscribe を透過的に扱えるようになります。

- **REQ サブスクリプションの管理**:
  - REQ の確立、CLOSE の送出、CLOSED メッセージのハンドリングといった REQ サブスクリプションの管理に必須の低レベルな操作を、より高レベルに抽象化されたインターフェースで取り扱えるようになります。
- **WebSocket の再接続**:
  - バックオフ戦略に基づいて WebSocket 伝送路の自動再接続を行います。切断時に伝送路から失われた REQ サブスクリプションも自動的に再構成します。
- **WebSocket 接続の遅延およびアイドリング**:
  - リレーとの WebSocket 接続を本当に必要になるまで遅延させたり、使われなくなった接続を自動で切断することができます。この挙動は設定で無効にもできます。
- **WebSocket 接続状態のモニタリング**:
  - WebSocket 接続のヘルスステータスを監視できます。アプリケーションはこれをリレーとの接続状況をユーザに通知するインターフェースの構築などに応用できます。
- **リレープールの管理**:
  - リレーの集合をリアクティブに扱います。デフォルトリレーの増減や Read/Write 設定の変更といったリレー構成の変化に反応して、新しいリレー構成のもとで現在アクティブな REQ を適切に再構成します。
- **リレーサーバ固有の制約へのフレキシブルな対応**
  - [NIP-11](https://github.com/nostr-protocol/nips/blob/master/11.md) に基づいて公開されるリレーの同時 REQ サブスクリプション上限に抵触しないよう、リレーへの REQ 要求を適切にキューイングします。
- **AUTH メッセージの自動ハンドリング**
  - [NIP-42](https://github.com/nostr-protocol/nips/blob/master/42.md) に基づく AUTH メッセージを自動でハンドリングします。rx-nostr を利用する場合、NIP-42 に対応するためにはオプションを設定するだけで済みます。
- **署名およびその検証**
  - 署名およびその検証を自動で行います。イベントを発行する際に開発者が用意する必要がある情報は、イベントの本質的なコンテンツだけです。

rx-nostr を使うと、例えば kind1 のイベントを購読するコードは以下のように簡潔に実現できます。なお、このコードの説明は [Getting Started](./getting-started.md) で詳述します。

```js
import { createRxNostr, createRxForwardReq } from "rx-nostr";

const rxNostr = createRxNostr();
rxNostr.setDefaultRelays(["wss://nostr.example.com"]);

const rxReq = createRxForwardReq();

rxNostr.use(rxReq).subscribe((packet) => {
  console.log(packet);
});

rxReq.emit({ kinds: [1] });
```

::: tip Note
本ドキュメントは NIP の、特に NIP-01 に関する基本的な理解を前提に記述されます。これに馴染みのない方は以下に挙げる資料に先に目を通すことをおすすめします。

- [NIP-01 (EN)](https://github.com/nostr-protocol/nips/blob/master/01.md)
- [NIP-01 (JA)](https://github.com/nostr-jp/nips-ja/blob/main/01.md)

:::
