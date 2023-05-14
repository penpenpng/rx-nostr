# Introduction

rx-nostr は [Nostr](https://nostr.com/) クライアントがリレーとより簡単に通信するための [RxJS](https://rxjs.dev/) に基づくライブラリで、以下のような特徴を持ちます:

- リレーセットまたは REQ Filter の変更に対してリアクティブに REQ のサブスクリプションを管理します
- CLOSE の管理を自動で行います。REQ のサブスクリプションは RxJS の [Subscription](https://rxjs.dev/guide/subscription) モデルの上で扱われるので `unsubscribe()` を呼び出すだけで明示的なタイミングで CLOSE することもできます
- 各 リレーの Read/Write 設定を尊重しつつ、リレーの多重性を隠蔽します
- RxJS の [webSocket](https://rxjs.dev/api/webSocket/webSocket) をバックエンドとして、自動で再接続処理を行います
- React や Vue をはじめとしたフロントエンドフレームワークに依存しません
- RxJS が備える強力な表現力の恩恵を最大限に受けることができます

本ドキュメントは Nostr と RxJS に関する基本的な知識を前提として記述されます。これらについて馴染みのない方は先に次に挙げる資料に目を通すことをおすすめします:

- [NIPs](https://github.com/nostr-protocol/nips)
- [RxJS Introduction](https://rxjs.dev/guide/overview)

## Getting Started

```sh
npm install rx-nostr
# or yarn install rx-nostr
```

## Playground

[リポジトリ](https://github.com/penpenpng/rx-nostr)をクローンして `npm install && npm run dev` を実行することで、 rx-nostr をブラウザ上ですぐに試すことができます。
`app/main.ts` を直接編集して保存すると、ページが即座にリロードされスクリプトは再実行されます。
