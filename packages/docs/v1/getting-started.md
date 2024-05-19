# Getting Started

::: danger Caution
このドキュメントは rx-nostr 1.x のものです。2.x のドキュメントは[こちら](../v2/)を参照してください。
:::

## Installation

npm または yarn から以下の通りインストールできます。

:::: code-group
::: code-group-item npm

```sh
npm install rx-nostr
```

:::
::: code-group-item yarn

```sh
yarn add rx-nostr
```

:::
::::

::: tip Node
rx-nostr を Node.js ランタイムの上で使用する場合は [websocket-polyfill](https://www.npmjs.com/package/websocket-polyfill) も同時にインストールする必要があります。
:::

## Playground

rx-nostr をすぐに試したい場合は以下の通りリポジトリをクローンして、`app/main.ts` を編集して動作を確認することができます。

```sh
git clone https://github.com/penpenpng/rx-nostr
cd rx-nostr
npm install
npm run dev

# then, open http://localhost:5173/ and edit ./app/main.ts
```

vite の HMR により、`app/main.ts` の変更が保存されるとページが即座にリロードされスクリプトは再実行されます。
